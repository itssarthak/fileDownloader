import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock ALL @mui imports to avoid dependency issues
jest.mock('@mui/material', () => ({
  Box: 'div',
  Container: 'div',
  Typography: 'div',
  Button: 'button',
  Paper: 'div',
  List: 'div',
  ListItem: 'div',
  ListItemText: 'div',
  CircularProgress: 'div',
  Alert: 'div',
  AppBar: 'div',
  Toolbar: 'div',
  IconButton: 'button',
  Tooltip: 'div',
  FormControlLabel: 'label',
  Checkbox: 'input',
  LinearProgress: 'div'
}))

jest.mock('@mui/icons-material', () => ({
  CloudUpload: () => 'CloudUpload',
  Download: () => 'Download',
  Refresh: () => 'Refresh'
}))

// Mock all other external dependencies
jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn()
  }
}))

jest.mock('axios', () => ({
  get: jest.fn()
}))

jest.mock('jszip', () => jest.fn())

jest.mock('./utils/analytics', () => ({
  initGA: jest.fn(),
  trackPageView: jest.fn(),
  trackFileUpload: jest.fn(),
  trackUrlExtraction: jest.fn(),
  trackDownload: jest.fn(),
  trackBatchDownload: jest.fn(),
  trackError: jest.fn(),
  trackUserInteraction: jest.fn()
}))

import App from './App'

describe('File Downloader App - Core Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock fetch for blog content
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('mock blog content')
    })
  })

  test('renders without crashing', () => {
    const { container } = render(<App />)
    expect(container).toBeInTheDocument()
  })
}) 