import '@testing-library/jest-dom'

/* global jest */

// Mock window properties
global.window = {
  URL: {
    createObjectURL: jest.fn(() => 'mock-url'),
    revokeObjectURL: jest.fn(),
  },
}

// Mock document properties
global.document = {
  createElement: jest.fn().mockImplementation(() => ({
    href: '',
    download: '',
    click: jest.fn(),
  })),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  },
}

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