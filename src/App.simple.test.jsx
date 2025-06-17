import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import App from './App'
import * as XLSX from 'xlsx'
import axios from 'axios'
import JSZip from 'jszip'
import { act } from 'react-dom/test-utils'
import * as analytics from './utils/analytics'

// Mock the external dependencies
jest.mock('xlsx')
jest.mock('axios')
jest.mock('jszip')
jest.mock('./utils/analytics')

describe('File Downloader App - Basic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset analytics mocks
    analytics.initGA.mockImplementation(() => {})
    analytics.trackPageView.mockImplementation(() => {})
    analytics.trackFileUpload.mockImplementation(() => {})
    analytics.trackUrlExtraction.mockImplementation(() => {})
    analytics.trackDownload.mockImplementation(() => {})
    analytics.trackBatchDownload.mockImplementation(() => {})
    analytics.trackError.mockImplementation(() => {})
    analytics.trackUserInteraction.mockImplementation(() => {})
  })

  test('renders app with initial state', () => {
    render(<App />)
    
    expect(screen.getByText('File Downloader')).toBeInTheDocument()
    expect(screen.getByText('Upload Excel/CSV File')).toBeInTheDocument()
    expect(screen.queryByText(/Found URLs/)).not.toBeInTheDocument()
    
    expect(analytics.initGA).toHaveBeenCalled()
    expect(analytics.trackPageView).toHaveBeenCalled()
  })

  test('handles file upload successfully', async () => {
    const mockData = [
      ['https://example.com/file1.jpg'],
      ['https://example.com/file2.pdf'],
      ['Invalid URL']
    ]
    
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} }
    })
    
    XLSX.utils.sheet_to_json.mockReturnValue(mockData)

    render(<App />)
    
    const file = new File(['test'], 'test.xlsx', { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    })
    const input = screen.getByLabelText(/upload excel\/csv file/i)
    
    await act(async () => {
      await userEvent.upload(input, file)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/Found URLs/)).toBeInTheDocument()
    })
    
    expect(screen.getByText('https://example.com/file1.jpg')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/file2.pdf')).toBeInTheDocument()
    
    expect(analytics.trackFileUpload).toHaveBeenCalledWith(file.type, file.size, true)
  })

  test('handles manual URL input', async () => {
    render(<App />)
    
    const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
    
    await act(async () => {
      await userEvent.type(textarea, 'https://example.com/file1.pdf\nhttps://example.com/file2.jpg')
    })
    
    await waitFor(() => {
      expect(screen.getByText(/Found URLs \(2\)/)).toBeInTheDocument()
    })
    
    expect(screen.getByText('https://example.com/file1.pdf')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/file2.jpg')).toBeInTheDocument()
  })

  test('validates URLs properly', async () => {
    render(<App />)
    
    const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
    
    const mixedInput = `https://valid.com/file.pdf
not-a-url
ftp://unsupported.com/file.txt
https://another-valid.com/image.jpg`
    
    await act(async () => {
      await userEvent.type(textarea, mixedInput)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/Found URLs \(2\)/)).toBeInTheDocument()
    })
    
    expect(screen.getByText('https://valid.com/file.pdf')).toBeInTheDocument()
    expect(screen.getByText('https://another-valid.com/image.jpg')).toBeInTheDocument()
  })

  test('handles file upload errors', async () => {
    XLSX.read.mockImplementation(() => {
      throw new Error('Invalid file')
    })

    render(<App />)
    
    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const input = screen.getByLabelText(/upload excel\/csv file/i)
    
    await act(async () => {
      await userEvent.upload(input, file)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/error reading file/i)).toBeInTheDocument()
    })
    
    expect(analytics.trackError).toHaveBeenCalledWith('file_reading', 'Invalid file', 'handleFileUpload')
  })
}) 