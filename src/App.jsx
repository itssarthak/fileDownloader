import { useState, useRef } from 'react'
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
  Tooltip
} from '@mui/material'
import { CloudUpload, Download, Refresh } from '@mui/icons-material'
import * as XLSX from 'xlsx'
import axios from 'axios'

function App() {
  const [file, setFile] = useState(null)
  const [urls, setUrls] = useState([])
  const [errors, setErrors] = useState([])
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const downloadedUrlsRef = useRef(new Set())
  const progressRef = useRef(0)

  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0]
    setFile(uploadedFile)
    setUrls([])
    setErrors([])
    setProgress(0)
    downloadedUrlsRef.current = new Set()
    progressRef.current = 0

    if (uploadedFile) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
          
          // Extract URLs from the data and remove duplicates using Set
          const uniqueUrls = [...new Set(jsonData.flat().filter(cell => {
            if (typeof cell === 'string') {
              try {
                new URL(cell)
                return true
              } catch {
                return false
              }
            }
            return false
          }))]
          
          setUrls(uniqueUrls)
        } catch (error) {
          console.error('File reading error:', error)
          setErrors(['Error reading file. Please make sure it\'s a valid Excel/CSV file.'])
        }
      }
      reader.readAsArrayBuffer(uploadedFile)
    }
  }

  const downloadFile = async (url) => {
    try {
      const response = await axios.get(url, { responseType: 'blob' })
      const filename = url.split('/').pop()
      const blob = new Blob([response.data])
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
      return true
    } catch (error) {
      console.error('Download error:', error)
      return false
    }
  }

  const handleDownloadAll = async () => {
    setDownloading(true)
    setErrors([])
    const allErrors = []

    // Filter out already downloaded URLs
    const urlsToDownload = urls.filter(url => !downloadedUrlsRef.current.has(url))

    if (urlsToDownload.length > 0) {
      // Create an array of promises for parallel downloads
      const downloadPromises = urlsToDownload.map(async (url) => {
        const success = await downloadFile(url)
        if (!success) {
          allErrors.push(url)
        } else {
          downloadedUrlsRef.current.add(url)
        }
        progressRef.current++
        setProgress((progressRef.current / urls.length) * 100)
      })

      // Wait for all downloads to complete
      await Promise.all(downloadPromises)
    }

    setErrors(allErrors)
    setDownloading(false)
  }

  const handleReset = () => {
    setProgress(0)
    setErrors([])
    setUrls([])
    setFile(null)
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
          {urls.length > 0 && (
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
                {downloading ? 'Downloading...' + (progress ? ` ${progress.toFixed(0)}%` : '') : `Download all files (${urls.length})` }
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="md">
        <Box sx={{ my: 4 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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
                  Upload Excel/CSV File
                </Button>
              </label>
              {file && (
                <Typography variant="body2" color="text.secondary">
                  Selected file: {file.name}
                </Typography>
              )}
            </Box>
          </Paper>

          {urls.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Found URLs ({urls.length})
              </Typography>
              <List>
                {urls.map((url, index) => (
                  <ListItem key={index}>
                    <ListItemText primary={url} />
                  </ListItem>
                ))}
              </List>
              {downloading && (
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress variant="determinate" value={progress} />
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    {Math.round(progress)}%
                  </Typography>
                </Box>
              )}
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
      </Container>
    </Box>
  )
}

export default App
