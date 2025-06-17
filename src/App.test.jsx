import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import App from './App'
import * as XLSX from 'xlsx'
import axios from 'axios'
import JSZip from 'jszip'
import { act } from 'react-dom/test-utils'
import * as analytics from './utils/analytics'

// Add Jest globals
/* global jest, describe, beforeEach, test, expect, afterEach */

// Mock the external dependencies
jest.mock('xlsx')
jest.mock('axios')
jest.mock('jszip')
jest.mock('./utils/analytics')

describe('File Downloader App', () => {
  beforeEach(() => {
    // Clear all mocks before each test
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

  afterEach(() => {
    jest.clearAllTimers()
  })

  describe('Initial Render and Analytics', () => {
    test('renders the app with initial state and initializes analytics', () => {
      render(<App />)
      
      // Check for main components
      expect(screen.getByText('File Downloader')).toBeInTheDocument()
      expect(screen.getByText('Upload Excel/CSV File')).toBeInTheDocument()
      expect(screen.getByText(/or paste file urls/i)).toBeInTheDocument()
      expect(screen.queryByText(/Found URLs/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Failed Downloads/)).not.toBeInTheDocument()
      
      // Check analytics initialization
      expect(analytics.initGA).toHaveBeenCalledWith(expect.any(String))
      expect(analytics.trackPageView).toHaveBeenCalledWith(window.location.pathname)
    })
  })

  describe('File Upload Functionality', () => {
    test('handles successful file upload and URL extraction', async () => {
      // Mock XLSX data
      const mockData = [
        ['https://example.com/file1.jpg'],
        ['https://example.com/file2.pdf'],
        ['Invalid URL'],
        ['https://example.com/file1.jpg'] // Duplicate
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
      const file = new File(['test'], 'test.xlsx', { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const input = screen.getByLabelText(/upload excel\/csv file/i)
      
      // Upload the file
      await act(async () => {
        await userEvent.upload(input, file)
      })
      
      // Wait for URLs to be displayed
      await waitFor(() => {
        expect(screen.getByText(/Found URLs \(2\)/)).toBeInTheDocument()
      })
      
      // Check that duplicates are removed
      expect(screen.getByText('https://example.com/file1.jpg')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/file2.pdf')).toBeInTheDocument()
      
      // Check analytics tracking
      expect(analytics.trackFileUpload).toHaveBeenCalledWith(file.type, file.size, true)
      expect(analytics.trackUrlExtraction).toHaveBeenCalledWith(4, 2)
    })

    test('handles file upload with invalid file format', async () => {
      // Mock XLSX error
      XLSX.read.mockImplementation(() => {
        throw new Error('Invalid file')
      })

      render(<App />)
      
      // Create a mock file
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const input = screen.getByLabelText(/upload excel\/csv file/i)
      
      // Upload the file
      await act(async () => {
        await userEvent.upload(input, file)
      })
      
      // Wait for error message
      await waitFor(() => {
        expect(screen.getByText(/error reading file/i)).toBeInTheDocument()
      })
      
      expect(analytics.trackError).toHaveBeenCalledWith('file_reading', 'Invalid file', 'handleFileUpload')
    })

    test('handles FileReader error', async () => {
      render(<App />)
      
      const file = new File(['test'], 'test.xlsx', { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const input = screen.getByLabelText(/upload excel\/csv file/i)
      
      // Mock FileReader to trigger error
      const originalFileReader = global.FileReader
      global.FileReader = jest.fn(() => ({
        readAsArrayBuffer: jest.fn(function() {
          // Trigger error
          setTimeout(() => this.onerror(), 0)
        }),
        onerror: null,
        onload: null
      }))
      
      await act(async () => {
        await userEvent.upload(input, file)
      })
      
      await waitFor(() => {
        expect(screen.getByText(/error reading file.*corrupted/i)).toBeInTheDocument()
      })
      
      expect(analytics.trackError).toHaveBeenCalledWith('file_reader', 'FileReader error', 'handleFileUpload')
      
      // Restore FileReader
      global.FileReader = originalFileReader
    })
  })

  describe('Manual URL Input Functionality', () => {
    test('handles manual URL input with different separators', async () => {
      render(<App />)
      
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      const manualUrls = `https://example.com/file1.pdf
https://example.com/file2.jpg,https://example.com/file3.png
https://example.com/file4.docx https://example.com/file5.txt
invalid-url
https://example.com/file1.pdf`  // Duplicate
      
      await act(async () => {
        await userEvent.type(textarea, manualUrls)
      })
      
      // Wait for URLs to be processed
      await waitFor(() => {
        expect(screen.getByText(/Found URLs \(5\)/)).toBeInTheDocument()
      })
      
      // Check all unique URLs are displayed
      expect(screen.getByText('https://example.com/file1.pdf')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/file2.jpg')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/file3.png')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/file4.docx')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/file5.txt')).toBeInTheDocument()
    })

    test('combines file upload and manual URLs', async () => {
      // Mock XLSX data
      const mockData = [['https://example.com/from-file.pdf']]
      
      XLSX.read.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      })
      
      XLSX.utils.sheet_to_json.mockReturnValue(mockData)

      render(<App />)
      
      // Upload file first
      const file = new File(['test'], 'test.xlsx', { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const input = screen.getByLabelText(/upload excel\/csv file/i)
      
      await act(async () => {
        await userEvent.upload(input, file)
      })
      
      // Add manual URLs
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, 'https://example.com/manual.jpg')
      })
      
      // Wait for combined URLs
      await waitFor(() => {
        expect(screen.getByText(/Found URLs \(2\)/)).toBeInTheDocument()
      })
      
      expect(screen.getByText('https://example.com/from-file.pdf')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/manual.jpg')).toBeInTheDocument()
    })
  })

  describe('Download Functionality', () => {
    test('handles successful individual downloads', async () => {
      const mockUrls = ['https://example.com/file1.jpg', 'https://example.com/file2.pdf']
      
      // Mock successful downloads
      axios.get.mockResolvedValue({
        data: new Blob(['test content']),
        headers: { 'content-disposition': 'attachment; filename=test.txt' }
      })
      
      // Setup URLs
      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrls.join('\n'))
      })
      
      // Wait for download button to appear
      await waitFor(() => {
        expect(screen.getByText(/Download 2 Files/i)).toBeInTheDocument()
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download 2 Files/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for downloads to complete
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 5000 })
      
      // Check that axios was called for each URL
      expect(axios.get).toHaveBeenCalledTimes(2)
      expect(axios.get).toHaveBeenCalledWith(mockUrls[0], expect.any(Object))
      expect(axios.get).toHaveBeenCalledWith(mockUrls[1], expect.any(Object))
      
      // Check analytics tracking
      expect(analytics.trackUserInteraction).toHaveBeenCalledWith('start_batch_download', 'download', 'individual')
      expect(analytics.trackDownload).toHaveBeenCalledTimes(2)
      expect(analytics.trackBatchDownload).toHaveBeenCalledWith(2, 2, 0, false, expect.any(Number))
    })

    test('handles ZIP download mode', async () => {
      const mockUrls = ['https://example.com/file1.jpg', 'https://example.com/file2.pdf']
      
      // Mock JSZip
      const mockZip = {
        file: jest.fn(),
        generateAsync: jest.fn().mockResolvedValue(new Blob(['zip content']))
      }
      JSZip.mockImplementation(() => mockZip)
      
      // Mock successful downloads
      axios.get.mockResolvedValue({
        data: new Blob(['test content']),
      })
      
      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrls.join('\n'))
      })
      
      // Enable ZIP mode
      await waitFor(() => {
        expect(screen.getByText(/Download as ZIP file/)).toBeInTheDocument()
      })
      
      const zipCheckbox = screen.getByRole('checkbox', { name: /Download as ZIP file/ })
      await act(async () => {
        fireEvent.click(zipCheckbox)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download as ZIP/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for downloads to complete
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 5000 })
      
      // Check that files were added to ZIP
      expect(mockZip.file).toHaveBeenCalledTimes(2)
      expect(mockZip.generateAsync).toHaveBeenCalledWith({ type: 'blob' })
      
      // Check analytics tracking for ZIP mode
      expect(analytics.trackUserInteraction).toHaveBeenCalledWith('start_batch_download', 'download', 'zip')
    })

    test('handles download failures and shows errors', async () => {
      const mockUrl = 'https://example.com/fail.jpg'
      
      // Mock failed axios response
      axios.get.mockRejectedValue(new Error('Network error'))

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrl)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/Failed Downloads/i)).toBeInTheDocument()
      })
      
      expect(screen.getByText(mockUrl)).toBeInTheDocument()
      expect(analytics.trackDownload).toHaveBeenCalledWith(mockUrl, false, 0, expect.any(Number))
    })

    test('handles CORS errors with proxy fallback', async () => {
      const mockUrl = 'https://example.com/cors-blocked.jpg'
      
      // Mock CORS error then successful proxy response
      axios.get
        .mockRejectedValueOnce({ code: 'ERR_NETWORK', request: {}, message: 'Network Error' })
        .mockRejectedValueOnce(new Error('First proxy failed'))
        .mockResolvedValueOnce({
          data: new Blob(['proxy content']),
        })

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrl)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for proxy retry and completion
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 5000 })
      
      // Should try original URL, then proxy services
      expect(axios.get).toHaveBeenCalledTimes(3) // Original + 2 proxy attempts (third succeeds)
    })

    test('handles timeout errors appropriately', async () => {
      const mockUrl = 'https://example.com/timeout.jpg'
      
      // Mock timeout error
      const timeoutError = new Error('timeout of 30000ms exceeded')
      timeoutError.code = 'ECONNABORTED'
      axios.get.mockRejectedValue(timeoutError)

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrl)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for error
      await waitFor(() => {
        expect(screen.getByText(/Failed Downloads/i)).toBeInTheDocument()
      })
      
      expect(screen.getByText(/Request timeout.*too large.*too slow/)).toBeInTheDocument()
    })
  })

  describe('Progress Tracking', () => {
    test('shows download progress for individual files', async () => {
      const mockUrl = 'https://example.com/file.jpg'
      
      // Mock axios with progress callback
      axios.get.mockImplementation((url, config) => {
        return new Promise((resolve) => {
          // Simulate progress updates
          setTimeout(() => {
            config.onDownloadProgress({ loaded: 50, total: 100 })
          }, 100)
          
          setTimeout(() => {
            config.onDownloadProgress({ loaded: 100, total: 100 })
            resolve({ data: new Blob(['test']) })
          }, 200)
        })
      })

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrl)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Check for progress indicators
      await waitFor(() => {
        expect(screen.getByText(/downloading/i)).toBeInTheDocument()
      })
      
      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })
    })

    test('shows overall batch progress', async () => {
      const mockUrls = ['https://example.com/file1.jpg', 'https://example.com/file2.pdf']
      
      let callCount = 0
      axios.get.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: new Blob(['test']) })
          }, 100 * (++callCount))
        })
      })

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrls.join('\n'))
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download 2 Files/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Check for progress display
      await waitFor(() => {
        expect(screen.getByText(/downloading/i)).toBeInTheDocument()
      })
      
      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 5000 })
    })
  })

  describe('Reset Functionality', () => {
    test('resets all application state', async () => {
      // Setup some state first
      const mockData = [['https://example.com/file1.jpg']]
      
      XLSX.read.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      })
      
      XLSX.utils.sheet_to_json.mockReturnValue(mockData)

      render(<App />)
      
      // Upload file
      const file = new File(['test'], 'test.xlsx', { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const input = screen.getByLabelText(/upload excel\/csv file/i)
      
      await act(async () => {
        await userEvent.upload(input, file)
      })
      
      // Add manual URLs
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      await act(async () => {
        await userEvent.type(textarea, 'https://example.com/manual.jpg')
      })
      
      // Wait for content to appear
      await waitFor(() => {
        expect(screen.getByText(/Found URLs/)).toBeInTheDocument()
      })
      
      // Click reset
      const resetButton = screen.getByRole('button', { name: /reset downloads/i })
      await act(async () => {
        fireEvent.click(resetButton)
      })
      
      // Check that state is reset
      expect(screen.queryByText(/Found URLs/)).not.toBeInTheDocument()
      expect(textarea.value).toBe('')
      expect(input.value).toBe('')
      
      // Check analytics tracking
      expect(analytics.trackUserInteraction).toHaveBeenCalledWith('reset', 'action', 'reset_all')
    })
  })

  describe('Skip Downloaded Feature', () => {
    test('shows skip downloaded option after downloads', async () => {
      const mockUrls = ['https://example.com/file1.jpg', 'https://example.com/file2.pdf']
      
      axios.get.mockResolvedValue({
        data: new Blob(['test content']),
      })
      
      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrls.join('\n'))
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download 2 Files/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for downloads to complete
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 5000 })
      
      // Skip downloaded option should now be visible
      expect(screen.getByText(/Skip already downloaded files/)).toBeInTheDocument()
    })
  })

  describe('Error Scenarios', () => {
    test('handles batch download errors gracefully', async () => {
      const mockUrls = ['https://example.com/file1.jpg']
      
      // Mock a general error in the download process
      axios.get.mockImplementation(() => {
        throw new Error('Unexpected batch error')
      })

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrls[0])
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for error
      await waitFor(() => {
        expect(screen.getByText(/Failed Downloads/i)).toBeInTheDocument()
      })
      
      expect(analytics.trackDownload).toHaveBeenCalledWith(mockUrls[0], false, 0, expect.any(Number))
    })

    test('provides helpful error messages for CORS issues', async () => {
      const mockUrl = 'https://example.com/cors.jpg'
      
      // Mock CORS error and all proxy failures
      axios.get.mockRejectedValue({ code: 'ERR_NETWORK', request: {}, message: 'Network Error' })

      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrl)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for error with helpful message
      await waitFor(() => {
        expect(screen.getByText(/CORS blocked.*proxy services failed/)).toBeInTheDocument()
      })
      
      // Should show "Open in New Tab" button
      expect(screen.getByText(/Open in New Tab/)).toBeInTheDocument()
    })
  })

  describe('URL Validation', () => {
    test('filters out invalid URLs from manual input', async () => {
      render(<App />)
      
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      const mixedInput = `https://valid.com/file.pdf
not-a-url
ftp://unsupported.com/file.txt
https://another-valid.com/image.jpg
just some text`
      
      await act(async () => {
        await userEvent.type(textarea, mixedInput)
      })
      
      // Wait for URLs to be processed
      await waitFor(() => {
        expect(screen.getByText(/Found URLs \(2\)/)).toBeInTheDocument()
      })
      
      // Only valid HTTP/HTTPS URLs should appear
      expect(screen.getByText('https://valid.com/file.pdf')).toBeInTheDocument()
      expect(screen.getByText('https://another-valid.com/image.jpg')).toBeInTheDocument()
      expect(screen.queryByText('not-a-url')).not.toBeInTheDocument()
      expect(screen.queryByText('ftp://unsupported.com/file.txt')).not.toBeInTheDocument()
    })

    test('handles empty manual input gracefully', async () => {
      render(<App />)
      
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, '   \n\n  ,, ')
      })
      
      // Should not show any URLs
      expect(screen.queryByText(/Found URLs/)).not.toBeInTheDocument()
    })
  })

  describe('Filename Handling', () => {
    test('handles URLs without file extensions', async () => {
      const mockUrl = 'https://example.com/api/download'
      
      axios.get.mockResolvedValue({
        data: new Blob(['test content']),
      })
      
      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrl)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download File/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for download to complete
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })
      
      // Should handle filename gracefully
      expect(axios.get).toHaveBeenCalledWith(mockUrl, expect.any(Object))
    })

    test('handles duplicate filenames in ZIP mode', async () => {
      const mockUrls = [
        'https://example1.com/file.pdf',
        'https://example2.com/file.pdf',
        'https://example3.com/file.pdf'
      ]
      
      // Mock JSZip
      const mockZip = {
        file: jest.fn(),
        generateAsync: jest.fn().mockResolvedValue(new Blob(['zip content']))
      }
      JSZip.mockImplementation(() => mockZip)
      
      axios.get.mockResolvedValue({
        data: new Blob(['test content']),
      })
      
      render(<App />)
      const textarea = screen.getByPlaceholderText(/https:\/\/example.com\/file1.pdf/i)
      
      await act(async () => {
        await userEvent.type(textarea, mockUrls.join('\n'))
      })
      
      // Enable ZIP mode
      const zipCheckbox = screen.getByRole('checkbox', { name: /Download as ZIP file/ })
      await act(async () => {
        fireEvent.click(zipCheckbox)
      })
      
      // Start download
      const downloadButton = screen.getByText(/Download as ZIP/i)
      await act(async () => {
        fireEvent.click(downloadButton)
      })
      
      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument()
      }, { timeout: 5000 })
      
      // Check that files were added with unique names
      expect(mockZip.file).toHaveBeenCalledTimes(3)
      expect(mockZip.file).toHaveBeenCalledWith('file.pdf', expect.any(Blob))
      expect(mockZip.file).toHaveBeenCalledWith('file_2.pdf', expect.any(Blob))
      expect(mockZip.file).toHaveBeenCalledWith('file_3.pdf', expect.any(Blob))
    })
  })
}) 