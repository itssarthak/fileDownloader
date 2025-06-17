import '@testing-library/jest-dom'

/* global jest */

// Set environment variables for testing
process.env.VITE_GA_MEASUREMENT_ID = 'G-TEST123'

// Mock fetch API for testing
global.fetch = jest.fn()

// Mock URL.createObjectURL and revokeObjectURL
const mockObjectURL = 'mock-object-url'
global.URL.createObjectURL = jest.fn(() => mockObjectURL)
global.URL.revokeObjectURL = jest.fn()

// Mock document.createElement for download links
const mockLink = {
  href: '',
  download: '',
  click: jest.fn(),
  style: {},
  setAttribute: jest.fn(),
  removeAttribute: jest.fn()
}

// Store original createElement
const originalCreateElement = document.createElement.bind(document)

// Mock createElement to return our mock link for 'a' elements
document.createElement = jest.fn((tagName) => {
  if (tagName === 'a') {
    return mockLink
  }
  return originalCreateElement(tagName)
})

// Mock window.gtag for Google Analytics
global.gtag = jest.fn()

// Mock window properties
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    search: '',
    hash: '',
    href: 'http://localhost/',
  },
  writable: true,
})

Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Test)',
  },
  writable: true,
})

// Mock CSS properties
global.getComputedStyle = jest.fn().mockImplementation(() => ({
  getPropertyValue: jest.fn(),
  WebkitAnimation: '',
}))

// Mock window.matchMedia
global.matchMedia = jest.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}))

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
  mockLink.click.mockClear()
  
  // Reset fetch mock
  fetch.mockClear()
  
  // Mock successful fetch by default
  fetch.mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('mock blog content'),
    blob: () => Promise.resolve(new Blob(['test content']))
  })
}) 