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
  const downloadedUrlsRef = useRef(new Set())
  const progressRef = useRef(0)

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
      // Track failed download
      trackDownload(url, false, 0, Date.now() - startTime)
      return null
    }
  }

  const handleDownloadAll = async () => {
    const startTime = Date.now()
    setDownloading(true)
    setErrors([])
    setFileProgress({})
    setDownloadedCount(0)
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

    // Filter out already downloaded URLs
    const urlsToDownload = mergedUrls.filter(url => !downloadedUrlsRef.current.has(url))

    if (urlsToDownload.length > 0) {
      // Create an array of promises for parallel downloads
      const downloadPromises = urlsToDownload.map(async (url) => {
        try {
          setFileProgress(prev => ({ ...prev, [url]: 0 }))
          const result = await downloadFile(url)
          if (!result) {
            allErrors.push(url)
          } else {
            downloadedUrlsRef.current.add(url)
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
          allErrors.push(url)
          setFileProgress(prev => ({ ...prev, [url]: 0 }))
        }
        progressRef.current++
        setProgress((progressRef.current / urls.length) * 100)
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
    downloadedUrlsRef.current = new Set()
    progressRef.current = 0
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ mb: 3 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            File Downloader
          </Typography>
          {mergedUrls.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1 }}>
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
                  : `${useZip ? 'Download as ZIP' : 'Download all files'} (${mergedUrls.length})`}
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
              <List>
                {mergedUrls.sort((a,b) => {
                    // sort the list by progress
                    const progressA = fileProgress[a] || 0
                    const progressB = fileProgress[b] || 0
                    return progressB - progressA
                }).map((url, index) => (
                  <ListItem key={index}>
                    <ListItemText 
                      primary={url}
                      secondary={
                        downloading && (
                          <Box sx={{ width: '100%', mt: 1 }}>
                            <LinearProgress 
                              variant="determinate" 
                              value={fileProgress[url] || 0}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                        )
                      }
                    />
                    <Typography variant="body2" color="text.secondary">
                      {fileProgress[url] || 0}%
                    </Typography>
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
                      {error}
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
