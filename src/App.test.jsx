import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import App from './App'
import * as XLSX from 'xlsx'
import axios from 'axios'
import { act } from 'react-dom/test-utils'

// Add Jest globals
/* global jest, describe, beforeEach, test, expect */

// Mock the external dependencies
jest.mock('xlsx')
jest.mock('axios')

describe('File Downloader App', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  test('renders the app with initial state', () => {
    render(<App />)
    
    // Check for main components
    expect(screen.getByText('File Downloader')).toBeInTheDocument()
    expect(screen.getByText('Upload Excel/CSV File')).toBeInTheDocument()
    expect(screen.queryByText(/Found URLs/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Failed Downloads/)).not.toBeInTheDocument()
  })

  test('handles file upload successfully', async () => {
    // Mock XLSX data
    const mockData = [
      ['https://example.com/file1.jpg'],
      ['https://example.com/file2.pdf'],
      ['Invalid URL']
    ]
    
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {}
      }
    })
    
    XLSX.utils.sheet_to_json.mockReturnValue(mockData)

    render(<App />)
    
    // Create a mock file
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const input = screen.getByLabelText(/upload excel\/csv file/i)
    
    // Upload the file
    await act(async () => {
      await userEvent.upload(input, file)
    })
    
    // Wait for URLs to be displayed
    await waitFor(() => {
      expect(screen.getByText(/Found URLs/)).toBeInTheDocument()
    })
    
    expect(screen.getByText('https://example.com/file1.jpg')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/file2.pdf')).toBeInTheDocument()
  })

  test('handles file upload error', async () => {
    // Mock XLSX error
    XLSX.read.mockImplementation(() => {
      throw new Error('Invalid file')
    })

    render(<App />)
    
    // Create a mock file
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const input = screen.getByLabelText(/upload excel\/csv file/i)
    
    // Upload the file
    await act(async () => {
      await userEvent.upload(input, file)
    })
    
    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/error reading file/i)).toBeInTheDocument()
    })
  })

  test('handles successful file downloads', async () => {
    // Setup
    const mockUrls = ['https://example.com/file1.jpg', 'https://example.com/file2.pdf']
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    
    // Mock XLSX functions
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {}
      }
    })
    XLSX.utils.sheet_to_json.mockReturnValue([mockUrls])
    
    // Mock successful downloads
    axios.get.mockResolvedValue({
      data: new Blob(['test']),
      headers: { 'content-disposition': 'attachment; filename=test.txt' }
    })
    
    const { getByLabelText, getByText } = render(<App />)
    
    // Upload file
    await act(async () => {
      fireEvent.change(getByLabelText(/upload excel\/csv file/i), { target: { files: [file] } })
    })
    
    // Wait for URLs to be extracted
    await waitFor(() => {
      expect(screen.getByText(/found urls/i)).toBeInTheDocument()
    })
    
    // Click download button
    await act(async () => {
      fireEvent.click(getByText(/download all files/i))
    })

    // Wait for downloads to complete
    await waitFor(() => {
      expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
    })
  })

  test('handles failed file downloads', async () => {
    // Mock failed axios response
    axios.get.mockRejectedValue(new Error('Download failed'))

    // Mock XLSX data
    const mockData = [
      ['https://example.com/file1.jpg'],
      ['https://example.com/file2.pdf']
    ]
    
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {}
      }
    })
    
    XLSX.utils.sheet_to_json.mockReturnValue(mockData)

    render(<App />)
    
    // Upload file
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const input = screen.getByLabelText(/upload excel\/csv file/i)
    
    await act(async () => {
      await userEvent.upload(input, file)
    })
    
    // Wait for download button to appear
    await waitFor(() => {
      expect(screen.getByText(/download all files/i)).toBeInTheDocument()
    })
    
    // Start download
    const downloadButton = screen.getByText(/download all files/i)
    await act(async () => {
      fireEvent.click(downloadButton)
    })
    
    // Wait for downloads to complete and errors to show
    await waitFor(() => {
      expect(screen.getByText(/failed downloads/i)).toBeInTheDocument()
    })
  })

  test('resets the application state', async () => {
    // Setup
    const mockUrls = ['https://example.com/file1.jpg']
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    
    // Mock XLSX functions
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {}
      }
    })
    XLSX.utils.sheet_to_json.mockReturnValue([mockUrls])
    
    const { getByLabelText, getByRole } = render(<App />)
    
    // Upload file
    await act(async () => {
      fireEvent.change(getByLabelText(/upload excel\/csv file/i), { target: { files: [file] } })
    })
    
    // Wait for URLs to be extracted
    await waitFor(() => {
      expect(screen.getByText(/found urls/i)).toBeInTheDocument()
    })
    
    // Click reset button using the aria-label
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /reset downloads/i }))
    })
    
    // Wait for the reset to complete and check if the application is reset
    await waitFor(() => {
      expect(screen.queryByText(/found urls/i)).not.toBeInTheDocument()
    }, { timeout: 2000 })
    
    // Check if the upload button is still available
    expect(screen.getByLabelText(/upload excel\/csv file/i)).toBeInTheDocument()
  })

  test('handles duplicate URLs correctly', async () => {
    // Setup
    const mockUrls = [
      'https://example.com/file1.jpg',
      'https://example.com/file1.jpg', // Duplicate URL
      'https://example.com/file2.pdf',
      'https://example.com/file2.pdf', // Another duplicate
      'https://example.com/file3.txt'
    ]
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    
    // Mock XLSX functions
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {}
      }
    })
    XLSX.utils.sheet_to_json.mockReturnValue([mockUrls])
    
    const { getByLabelText } = render(<App />)
    
    // Upload file
    await act(async () => {
      fireEvent.change(getByLabelText(/upload excel\/csv file/i), { target: { files: [file] } })
    })
    
    // Wait for URLs to be extracted
    await waitFor(() => {
      expect(screen.getByText(/found urls/i)).toBeInTheDocument()
    })
    
    // Verify that duplicate URLs are shown only once
    const urlElements = screen.getAllByText(/https:\/\/example\.com\/file1\.jpg/)
    expect(urlElements).toHaveLength(1)
    
    const urlElements2 = screen.getAllByText(/https:\/\/example\.com\/file2\.pdf/)
    expect(urlElements2).toHaveLength(1)
    
    // Verify total count is correct (should be 3 unique URLs)
    const downloadButton = screen.getByRole('button', { name: /download all files/i })
    expect(downloadButton).toHaveTextContent('Download all files (3)')
  })

  test('verifies download count matches unique URLs', async () => {
    // Setup
    const mockUrls = [
      'https://example.com/file1.jpg',
      'https://example.com/file1.jpg', // Duplicate URL
      'https://example.com/file2.pdf',
      'https://example.com/file3.txt'
    ]
    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    
    // Mock XLSX functions
    XLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {}
      }
    })
    XLSX.utils.sheet_to_json.mockReturnValue([mockUrls])
    
    // Mock successful downloads
    axios.get.mockResolvedValue({
      data: new Blob(['test']),
      headers: { 'content-disposition': 'attachment; filename=test.txt' }
    })
    
    const { getByLabelText } = render(<App />)
    
    // Upload file
    await act(async () => {
      fireEvent.change(getByLabelText(/upload excel\/csv file/i), { target: { files: [file] } })
    })
    
    // Wait for URLs to be extracted
    await waitFor(() => {
      expect(screen.getByText(/found urls/i)).toBeInTheDocument()
    })
    
    // Verify initial count (should be 3 unique URLs)
    const downloadButton = screen.getByRole('button', { name: /download all files/i })
    expect(downloadButton).toHaveTextContent('Download all files (3)')
    
    // Start download
    await act(async () => {
      fireEvent.click(downloadButton)
    })
    
    // Wait for downloads to complete
    await waitFor(() => {
      expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
    })
    
    // Verify final count still matches number of unique URLs
    expect(downloadButton).toHaveTextContent('Download all files (3)')
  })
}) 