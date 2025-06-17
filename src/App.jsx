import { useState, useRef, useEffect } from 'react'
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  AppBar,
  Toolbar,
  IconButton,
  Tooltip,
  FormControlLabel,
  Checkbox,
  LinearProgress
} from '@mui/material'
import { CloudUpload, Download, Refresh } from '@mui/icons-material'
import * as XLSX from 'xlsx'
import axios from 'axios'
import JSZip from 'jszip'
import { marked } from 'marked'
import { initGA, trackPageView, trackFileUpload, trackUrlExtraction, trackDownload, trackBatchDownload, trackError, trackUserInteraction } from './utils/analytics'

// Initialize Google Analytics with your measurement ID
const GA_MEASUREMENT_ID = 'G-3EMKW9KYM5'

function App() {
  const [file, setFile] = useState(null)
  const [urls, setUrls] = useState([])
  const [errors, setErrors] = useState([])
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [useZip, setUseZip] = useState(false)
  const [fileProgress, setFileProgress] = useState({})
  const [downloadedCount, setDownloadedCount] = useState(0)
  const [blogContent, setBlogContent] = useState('')
  const [manualUrls, setManualUrls] = useState('')
  const [mergedUrls, setMergedUrls] = useState([])
  const [proxyStatus, setProxyStatus] = useState({}) // Track which URLs are using proxy
  const [skipDownloaded, setSkipDownloaded] = useState(false) // NEW: Control whether to skip downloaded URLs
  const downloadedUrlsRef = useRef(new Set())
  const progressRef = useRef(0)
  const fileInputRef = useRef(null) // NEW: Reference to file input for proper reset

  useEffect(() => {
    // Initialize Google Analytics
    initGA(GA_MEASUREMENT_ID)
    // Track initial page view
    trackPageView(window.location.pathname)

    // Fetch blog content when component mounts
    fetch('/blog.txt')
      .then(response => response.text())
      .then(text => setBlogContent(text))
      .catch(error => console.error('Error fetching blog:', error))
  }, [])

  useEffect(() => {
    // Update merged URLs whenever urls or manualUrls change
    setMergedUrls(Array.from(new Set([
      ...urls,  
      ...parseManualUrls(manualUrls)
    ])))
  }, [urls, manualUrls])

  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0]
    setFile(uploadedFile)
    setUrls([])
    setErrors([])
    setProgress(0)
    setFileProgress({})
    setDownloadedCount(0)
    setProxyStatus({})
    setManualUrls('')  // FIXED: Also reset manual URLs when uploading new file
    downloadedUrlsRef.current = new Set()
    progressRef.current = 0

    if (uploadedFile) {
      // Track file upload attempt
      trackFileUpload(uploadedFile.type, uploadedFile.size, true)
      
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
          
          // Extract URLs from the data and remove duplicates using Set
          const allUrls = jsonData.flat().filter(cell => {
            if (typeof cell === 'string') {
              try {
                new URL(cell)
                return true
              } catch {
                return false
              }
            }
            return false
          })
          
          const uniqueUrls = [...new Set(allUrls)]
          setUrls(uniqueUrls)
          
          // Track URL extraction
          trackUrlExtraction(allUrls.length, uniqueUrls.length)
        } catch (error) {
          console.error('File reading error:', error)
          setErrors(['Error reading file. Please make sure it\'s a valid Excel/CSV file.'])
          trackError('file_reading', error.message, 'handleFileUpload')
        }
      }
      reader.readAsArrayBuffer(uploadedFile)
    }
  }

  // Helper to parse URLs from textarea
  const parseManualUrls = (input) => {
    if (!input) return []
    // Split by newlines, commas, or spaces
    return input
      .split(/\n|,|\s/)
      .map(url => url.trim())
      .filter(url => {
        if (!url) return false
        try {
          new URL(url)
          return true
        } catch {
          return false
        }
      })
  }

  const downloadFile = async (url) => {
    const startTime = Date.now()
    try {
      const response = await axios.get(url, { 
        responseType: 'blob',
        timeout: 30000, // 30 second timeout
        headers: {
          'Accept': '*/*',
        },
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setFileProgress(prev => ({ ...prev, [url]: percentCompleted }))
        }
      })
      const filename = url.split('/').pop()
      const downloadTime = Date.now() - startTime
      
      // Track successful download
      trackDownload(url, true, response.data.size, downloadTime)
      
      return { blob: response.data, filename }
    } catch (error) {
      console.error('Download error:', error)
      
      // If it's a CORS error, try proxy services automatically
      if (error.request && !error.response) {
        console.log('🚫 CORS detected, automatically trying proxy services...')
        try {
          // Mark as using proxy
          setProxyStatus(prev => ({ ...prev, [url]: 'retrying' }))
          // Reset progress to show proxy attempt
          setFileProgress(prev => ({ ...prev, [url]: 0 }))
          
          const proxyResult = await downloadWithProxy(url, (progress) => {
            setFileProgress(prev => ({ ...prev, [url]: progress }))
          })
          
          console.log(`🎉 Proxy download successful using: ${proxyResult.usedProxy}`)
          
          // Mark as successful with proxy
          setProxyStatus(prev => ({ ...prev, [url]: `success-${proxyResult.usedProxy}` }))
          
          // Track successful proxy download
          trackDownload(url, true, proxyResult.blob.size, Date.now() - startTime)
          return proxyResult
        } catch (proxyError) {
          console.error('❌ All proxy services failed:', proxyError)
          // Mark as failed
          setProxyStatus(prev => ({ ...prev, [url]: 'failed' }))
          // Track failed download after proxy attempts
          trackDownload(url, false, 0, Date.now() - startTime)
          return { error: 'CORS blocked and all proxy services failed - try opening the URL directly in a new tab' }
        }
      }
      
      // Track failed download for non-CORS errors
      trackDownload(url, false, 0, Date.now() - startTime)
      
      // Return error details for better user feedback
      let errorMessage = 'Unknown error'
      if (error.response) {
        // Server responded with error status
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`
      } else {
        // Something else happened
        errorMessage = error.message
      }
      
      return { error: errorMessage }
    }
  }

  // Helper to try downloading via proxy services with progress tracking
  const downloadWithProxy = async (url, onProgress) => {
    const proxyServices = [
      {
        name: 'AllOrigins',
        getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      },
      {
        name: 'cors.bridged.cc', 
        getUrl: (url) => `https://cors.bridged.cc/${url}`
      },
      {
        name: 'ThingProxy',
        getUrl: (url) => `https://thingproxy.freeboard.io/fetch/${url}`
      }
    ];

    for (const proxy of proxyServices) {
      try {
        console.log(`🔄 Trying proxy: ${proxy.name} for ${url}`);
        const proxyUrl = proxy.getUrl(url);
        
        const response = await axios.get(proxyUrl, { 
          responseType: 'blob',
          timeout: 45000, // Increased timeout for proxy
          headers: {
            'Accept': '*/*',
          },
          onDownloadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
              onProgress(percentCompleted)
            }
          }
        });
        
        console.log(`✅ Success with proxy: ${proxy.name}`);
        return { blob: response.data, filename: url.split('/').pop(), usedProxy: proxy.name };
      } catch (error) {
        console.log(`❌ Failed with proxy ${proxy.name}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('All proxy services failed');
  };

  const handleDownloadAll = async () => {
    const startTime = Date.now()
    setDownloading(true)
    setErrors([])
    setFileProgress({})
    setDownloadedCount(0)
    progressRef.current = 0  // FIXED: Reset progress counter
    const allErrors = []
    const zip = useZip ? new JSZip() : null
    const filenameCount = {}

    // Track batch download start
    trackUserInteraction('start_batch_download', 'download', useZip ? 'zip' : 'individual')

    // Merge file and manual URLs, remove duplicates
    const mergedUrls = Array.from(new Set([
      ...urls,
      ...parseManualUrls(manualUrls)
    ]))

    // FIXED: Only filter out already downloaded URLs if skipDownloaded is true
    const urlsToDownload = skipDownloaded 
      ? mergedUrls.filter(url => !downloadedUrlsRef.current.has(url))
      : mergedUrls

    if (urlsToDownload.length > 0) {
      // Create an array of promises for parallel downloads
      const downloadPromises = urlsToDownload.map(async (url) => {
        try {
          setFileProgress(prev => ({ ...prev, [url]: 0 }))
          const result = await downloadFile(url)
          if (!result || result.error) {
            // Store both URL and error message for better user feedback
            allErrors.push({
              url: url,
              error: result?.error || 'Download failed'
            })
          } else {
            // Only add to downloaded set if not already present
            if (!downloadedUrlsRef.current.has(url)) {
              downloadedUrlsRef.current.add(url)
            }
            setDownloadedCount(prev => prev + 1)
            if (useZip) {
              // Handle duplicate filenames
              const originalFilename = result.filename
              const extension = originalFilename.split('.').pop()
              const baseName = originalFilename.slice(0, -(extension.length + 1))
              
              // Initialize or increment counter for this filename
              filenameCount[originalFilename] = (filenameCount[originalFilename] || 0) + 1
              const count = filenameCount[originalFilename]
              
              // Create unique filename if it's a duplicate
              const uniqueFilename = count > 1 
                ? `${baseName}_${count}.${extension}`
                : originalFilename
              
              zip.file(uniqueFilename, result.blob)
            } else {
              // Download individual file
              const blob = new Blob([result.blob])
              const downloadUrl = window.URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = downloadUrl
              link.download = result.filename
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              window.URL.revokeObjectURL(downloadUrl)
            }
          }
        } catch (error) {
          allErrors.push({
            url: url,
            error: 'Unexpected error during download'
          })
          setFileProgress(prev => ({ ...prev, [url]: 0 }))
        }
        progressRef.current++
        setProgress((progressRef.current / urlsToDownload.length) * 100)  // FIXED: Use correct denominator
      })

      // Wait for all downloads to complete
      await Promise.all(downloadPromises)

      // If using zip, generate and download the zip file
      if (useZip) {
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const zipUrl = window.URL.createObjectURL(zipBlob)
        const link = document.createElement('a')
        link.href = zipUrl
        link.download = `filedownloader.in_${timestamp}.zip`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(zipUrl)
      }
    }

    // After all downloads complete
    const totalTime = Date.now() - startTime
    trackBatchDownload(
      urlsToDownload.length,
      urlsToDownload.length - allErrors.length,
      allErrors.length,
      useZip,
      totalTime
    )

    setErrors(allErrors)
    setDownloading(false)
  }

  const handleReset = () => {
    trackUserInteraction('reset', 'action', 'reset_all')
    setProgress(0)
    setErrors([])
    setUrls([])
    setFile(null)
    setUseZip(false)
    setFileProgress({})
    setDownloadedCount(0)
    setManualUrls('')
    setProxyStatus({})
    setSkipDownloaded(false)  // FIXED: Reset skip downloaded option
    downloadedUrlsRef.current = new Set()
    progressRef.current = 0
    
    // FIXED: Properly reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ mb: 3 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            File Downloader
          </Typography>
          {mergedUrls.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Tooltip title="Reset Downloads">
                <IconButton 
                  color="inherit" 
                  onClick={handleReset}
                  aria-label="reset downloads"
                >
                  <Refresh />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                color="secondary"
                onClick={handleDownloadAll}
                disabled={downloading}
                startIcon={downloading ? <CircularProgress size={20} /> : <Download />}
              >
                {downloading 
                  ? `Downloading...${progress ? ` ${progress.toFixed(0)}%` : ''}` 
                  : `${useZip ? 'Download as ZIP' : `Download ${mergedUrls.length === 1 ? 'file' : `${mergedUrls.length} files`}`}`}
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md">
        <Box sx={{ my: 4 , minHeight:"70vh", display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center'}}>
          <Paper sx={{ p: 3, mb: 3, minWidth: "80vw" }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: '30vh', justifyContent: 'center' }}>
              <input
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                id="file-upload"  
                type="file"
                ref={fileInputRef}  
                onChange={handleFileUpload}
              />
              <label htmlFor="file-upload">
                <Button
                  variant="contained"
                  component="span"
                  startIcon={<CloudUpload />}
                >
                  Select Excel/CSV File
                </Button>
              </label>
              {file && (
                <Typography variant="body2" color="text.secondary">
                  Selected file: {file.name}
                </Typography>
              )}
              {/* Manual URL input */}
              <Box sx={{ width: '90%', mt: 2, justifyContent: 'center', alignItems: 'center' }}>
                <Typography variant="subtitle1" gutterBottom>
                  Or paste file URLs (one per line, comma, or space separated):
                </Typography>
                <br />
                <textarea
                  value={manualUrls}
                  onChange={e => setManualUrls(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    fontSize: '1rem',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    resize: 'vertical',
                    background: 'var(--mui-palette-background-paper, #fff)',
                    color: 'var(--mui-palette-text-primary, #222)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'border-color 0.2s',
                    outline: 'none',
                  }}
                  placeholder="https://example.com/file1.pdf
https://example.com/file2.jpg"
                  onFocus={e => (e.target.style.borderColor = '#646cff')}
                  onBlur={e => (e.target.style.borderColor = '#ccc')}
                />
              </Box>
            </Box>
          </Paper>
          {mergedUrls.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              {
                !downloading && (
                <Box>
                    <Typography variant="h6" gutterBottom>
                    Found URLs ({mergedUrls.length})
                    </Typography>
                    <FormControlLabel
                        control={
                        <Checkbox
                            checked={useZip}
                            onChange={(e) => setUseZip(e.target.checked)}
                            color="primary"
                        />
                        }
                        label="Download as ZIP file"
                    />
                    {downloadedUrlsRef.current.size > 0 && (
                        <FormControlLabel
                            control={
                            <Checkbox
                                checked={skipDownloaded}
                                onChange={(e) => setSkipDownloaded(e.target.checked)}
                                color="primary"
                            />
                            }
                            label="Skip already downloaded files"
                        />
                    )}
                </Box>
              )}
              {downloading && (
                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <CircularProgress variant="determinate" value={progress} />
                  <Typography variant="body2">
                    {Math.round(progress)}% Complete
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Downloaded {downloadedCount} of {mergedUrls.length} files
                  </Typography>
                </Box>
              )}
              <List sx={{ 
                '& .MuiListItem-root': {
                  borderRadius: 2,
                  mb: 1,
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  border: '1px solid rgba(0, 0, 0, 0.05)'
                }
              }}>
                {mergedUrls.sort((a,b) => {
                    // sort the list by progress
                    const progressA = fileProgress[a] || 0
                    const progressB = fileProgress[b] || 0
                    return progressB - progressA
                }).map((url, index) => (
                  <ListItem key={index} sx={{ 
                    py: 2,
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)'
                    }
                  }}>
                    <ListItemText 
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                          <Typography 
                            variant="body1" 
                            sx={{ 
                              flex: 1,
                              wordBreak: 'break-all',
                              fontSize: '0.9rem'
                            }}
                          >
                            {url}
                          </Typography>
                          
                          {/* Status Icon */}
                          {proxyStatus[url] === 'retrying' && (
                            <Tooltip title="Retrying with proxy service" arrow>
                              <CircularProgress size={16} sx={{ color: '#ff9800' }} />
                            </Tooltip>
                          )}
                          {proxyStatus[url]?.startsWith('success-') && (
                            <Tooltip title={`Downloaded via ${proxyStatus[url].split('-')[1]} proxy`} arrow>
                              <Box sx={{ 
                                width: 8, 
                                height: 8, 
                                borderRadius: '50%', 
                                backgroundColor: '#ff9800',
                                border: '2px solid #4caf50'
                              }} />
                            </Tooltip>
                          )}
                          {downloadedUrlsRef.current.has(url) && !proxyStatus[url]?.startsWith('success-') && (
                            <Tooltip title="Downloaded directly" arrow>
                              <Box sx={{ 
                                width: 8, 
                                height: 8, 
                                borderRadius: '50%', 
                                backgroundColor: '#4caf50'
                              }} />
                            </Tooltip>
                          )}
                        </Box>
                      }
                      secondary={
                        downloading && (
                          <Box sx={{ width: '100%', mt: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                {proxyStatus[url] === 'retrying' ? 'Downloading via proxy...' : 'Downloading...'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {fileProgress[url] || 0}%
                              </Typography>
                            </Box>
                            <LinearProgress 
                              variant="determinate" 
                              value={fileProgress[url] || 0}
                              sx={{ 
                                height: 6, 
                                borderRadius: 3,
                                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: proxyStatus[url] === 'retrying' ? '#ff9800' : '#1976d2'
                                }
                              }}
                            />
                          </Box>
                        )
                      }
                    />
                  </ListItem>
                ))} 
              </List>
            </Paper>
          )}

          {errors.length > 0 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" color="error" gutterBottom>
                Failed Downloads ({errors.length})
              </Typography>
              <List>
                {errors.map((error, index) => (
                  <ListItem key={index}>
                    <Alert severity="error" sx={{ width: '100%' }}>
                      <Typography variant="body2" component="div">
                        <strong>URL:</strong> {typeof error === 'string' ? error : error.url}
                      </Typography>
                      {typeof error === 'object' && error.error && (
                        <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                          <strong>Error:</strong> {error.error}
                        </Typography>
                      )}
                      {typeof error === 'object' && error.error?.includes('CORS') && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="body2" component="div" sx={{ fontStyle: 'italic' }}>
                            💡 Tip: This file is blocked by CORS restrictions. Try downloading it directly:
                          </Typography>
                          <Button
                            variant="outlined"
                            size="small"
                            sx={{ mt: 1 }}
                            onClick={() => window.open(error.url, '_blank')}
                          >
                            Open in New Tab
                          </Button>
                        </Box>
                      )}
                    </Alert>
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Box>
        {/* Blog Content Section */}
        {/* {!file && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box 
                sx={{ 
                  '& h1': { fontSize: '2rem', mb: 2 },
                  '& h2': { fontSize: '1.5rem', mt: 3, mb: 2 },
                  '& h3': { fontSize: '1.25rem', mt: 2, mb: 1 },
                  '& p': { mb: 2 },
                  '& ul': { pl: 3, mb: 2 },
                  '& li': { mb: 1 }
                }}
                dangerouslySetInnerHTML={{ __html: marked(blogContent) }}
              />
            </Paper>
        )} */}
      </Container>
    </Box>
  )
}

export default App
