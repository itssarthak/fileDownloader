import { useState, useRef, useEffect } from 'react';
import { 
  Box,
  Container,
  Typography,
  Paper,
  AppBar,
  Toolbar,
  LinearProgress,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import * as XLSX from 'xlsx';
import axios from 'axios';
import JSZip from 'jszip';
import { marked } from 'marked';
import { initGA, trackPageView, trackFileUpload, trackUrlExtraction, trackDownload, trackBatchDownload, trackError, trackUserInteraction } from './utils/analytics';
import FileUpload from './components/FileUpload';
import DownloadControls from './components/DownloadControls';
import UrlList from './components/UrlList';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

const MAX_CONCURRENT_DOWNLOADS = 6;
const DOWNLOAD_TIMEOUT = 30000;
const PROXY_TIMEOUT = 45000;

function App() {
  const [file, setFile] = useState(null);
  const [urls, setUrls] = useState([]);
  const [errors, setErrors] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [useZip, setUseZip] = useState(false);
  const [fileProgress, setFileProgress] = useState({});
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [blogContent, setBlogContent] = useState('');
  const [manualUrls, setManualUrls] = useState('');
  const [mergedUrls, setMergedUrls] = useState([]);
  const [proxyStatus, setProxyStatus] = useState({});
  const [skipDownloaded, setSkipDownloaded] = useState(false);
  const downloadedUrlsRef = useRef(new Set());
  const progressRef = useRef(0);
  const fileInputRef = useRef(null);
  const createdBlobUrlsRef = useRef(new Set());

  useEffect(() => {
    if (GA_MEASUREMENT_ID) {
      initGA(GA_MEASUREMENT_ID);
      trackPageView(window.location.pathname);
    }

    fetch('/blog.txt')
      .then(response => response.text())
      .then(text => setBlogContent(text))
      .catch(error => console.error('Error fetching blog:', error));

    const savedState = JSON.parse(localStorage.getItem('fileDownloaderState'));
    if (savedState) {
      setUrls(savedState.urls || []);
      setManualUrls(savedState.manualUrls || '');
      downloadedUrlsRef.current = new Set(savedState.downloadedUrls || []);
    }

    return () => {
      createdBlobUrlsRef.current.forEach(url => {
        window.URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    const stateToSave = {
      urls,
      manualUrls,
      downloadedUrls: Array.from(downloadedUrlsRef.current),
    };
    localStorage.setItem('fileDownloaderState', JSON.stringify(stateToSave));
  }, [urls, manualUrls]);

  useEffect(() => {
    setMergedUrls(Array.from(new Set([
      ...urls,  
      ...parseManualUrls(manualUrls)
    ])));
  }, [urls, manualUrls]);

  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    setFile(uploadedFile);
    setUrls([]);
    setErrors([]);
    setProgress(0);
    setFileProgress({});
    setDownloadedCount(0);
    setProxyStatus({});
    setManualUrls('');
    downloadedUrlsRef.current = new Set();
    progressRef.current = 0;

    if (uploadedFile) {
      if (GA_MEASUREMENT_ID) {
        trackFileUpload(uploadedFile.type, uploadedFile.size, true);
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          const allUrls = jsonData.flat().filter(cell => {
            if (typeof cell === 'string') {
              try {
                new URL(cell);
                return true;
              } catch {
                return false;
              }
            }
            return false;
          });
          
          const uniqueUrls = [...new Set(allUrls)];
          setUrls(uniqueUrls);
          
          if (GA_MEASUREMENT_ID) {
            trackUrlExtraction(allUrls.length, uniqueUrls.length);
          }
        } catch (error) {
          console.error('File reading error:', error);
          const errorMessage = 'Error reading file. Please make sure it\'s a valid Excel/CSV file.';
          setErrors([errorMessage]);
          if (GA_MEASUREMENT_ID) {
            trackError('file_reading', error.message, 'handleFileUpload');
          }
        }
      };
      
      reader.onerror = () => {
        const errorMessage = 'Error reading file. The file may be corrupted or in an unsupported format.';
        setErrors([errorMessage]);
        if (GA_MEASUREMENT_ID) {
          trackError('file_reader', 'FileReader error', 'handleFileUpload');
        }
      };
      
      reader.readAsArrayBuffer(uploadedFile);
    }
  };

  const parseManualUrls = (input) => {
    if (!input) return [];
    return input
      .split(/\n|,|\s/)
      .map(url => url.trim())
      .filter(url => {
        if (!url) return false;
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      });
  };

  const downloadFile = async (url) => {
    const startTime = Date.now();
    try {
      const response = await axios.get(url, { 
        responseType: 'blob',
        timeout: DOWNLOAD_TIMEOUT,
        headers: {
          'Accept': '*/*',
        },
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setFileProgress(prev => ({ ...prev, [url]: percentCompleted }));
          }
        }
      });
      const filename = url.split('/').pop() || 'downloaded_file';
      const downloadTime = Date.now() - startTime;
      
      if (GA_MEASUREMENT_ID) {
        trackDownload(url, true, response.data.size, downloadTime);
      }
      
      return { blob: response.data, filename };
    } catch (error) {
      console.error('Download error:', error);
      
      if (error.code === 'ERR_NETWORK' || (error.request && !error.response)) {
        console.log('🚫 CORS detected, automatically trying proxy services...');
        try {
          setProxyStatus(prev => ({ ...prev, [url]: 'retrying' }));
          setFileProgress(prev => ({ ...prev, [url]: 0 }));
          
          const proxyResult = await downloadWithProxy(url, (progress) => {
            setFileProgress(prev => ({ ...prev, [url]: progress }));
          });
          
          console.log(`🎉 Proxy download successful using: ${proxyResult.usedProxy}`);
          setProxyStatus(prev => ({ ...prev, [url]: `success-${proxyResult.usedProxy}` }));
          
          if (GA_MEASUREMENT_ID) {
            trackDownload(url, true, proxyResult.blob.size, Date.now() - startTime);
          }
          return proxyResult;
        } catch (proxyError) {
          console.error('❌ All proxy services failed:', proxyError);
          setProxyStatus(prev => ({ ...prev, [url]: 'failed' }));
          if (GA_MEASUREMENT_ID) {
            trackDownload(url, false, 0, Date.now() - startTime);
          }
          return { error: 'CORS blocked and all proxy services failed - try opening the URL directly in a new tab' };
        }
      }
      
      if (GA_MEASUREMENT_ID) {
        trackDownload(url, false, 0, Date.now() - startTime);
      }
      
      let errorMessage = 'Unknown error';
      if (error.response) {
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout - file may be too large or server too slow';
      } else {
        errorMessage = error.message;
      }
      
      return { error: errorMessage };
    }
  };

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
          timeout: PROXY_TIMEOUT,
          headers: {
            'Accept': '*/*',
          },
          onDownloadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(percentCompleted);
            }
          }
        });
        
        console.log(`✅ Success with proxy: ${proxy.name}`);
        return { blob: response.data, filename: url.split('/').pop() || 'downloaded_file', usedProxy: proxy.name };
      } catch (error) {
        console.log(`❌ Failed with proxy ${proxy.name}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('All proxy services failed');
  };

  const downloadInBatches = async (urlsToDownload, batchSize = MAX_CONCURRENT_DOWNLOADS) => {
    const allErrors = [];
    const zip = useZip ? new JSZip() : null;
    const filenameCount = {};

    for (let i = 0; i < urlsToDownload.length; i += batchSize) {
      const batch = urlsToDownload.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (url) => {
        try {
          setFileProgress(prev => ({ ...prev, [url]: 0 }));
          const result = await downloadFile(url);
          if (!result || result.error) {
            allErrors.push({
              url: url,
              error: result?.error || 'Download failed'
            });
          } else {
            if (!downloadedUrlsRef.current.has(url)) {
              downloadedUrlsRef.current.add(url);
            }
            setDownloadedCount(prev => prev + 1);
            
            if (useZip) {
              const originalFilename = result.filename;
              const extension = originalFilename.includes('.') ? originalFilename.split('.').pop() : 'file';
              const baseName = originalFilename.includes('.') ? originalFilename.slice(0, -(extension.length + 1)) : originalFilename;
              
              filenameCount[originalFilename] = (filenameCount[originalFilename] || 0) + 1;
              const count = filenameCount[originalFilename];
              
              const uniqueFilename = count > 1 
                ? `${baseName}_${count}.${extension}`
                : originalFilename;
              
              zip.file(uniqueFilename, result.blob);
            } else {
              const blob = new Blob([result.blob]);
              const downloadUrl = window.URL.createObjectURL(blob);
              createdBlobUrlsRef.current.add(downloadUrl);
              
              const link = document.createElement('a');
              link.href = downloadUrl;
              link.download = result.filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              setTimeout(() => {
                window.URL.revokeObjectURL(downloadUrl);
                createdBlobUrlsRef.current.delete(downloadUrl);
              }, 1000);
            }
          }
        } catch (error) {
          allErrors.push({
            url: url,
            error: 'Unexpected error during download'
          });
          setFileProgress(prev => ({ ...prev, [url]: 0 }));
        }
        progressRef.current++;
        setProgress((progressRef.current / urlsToDownload.length) * 100);
      });

      await Promise.all(batchPromises);
    }

    return { allErrors, zip };
  };

  const handleDownloadAll = async () => {
    const startTime = Date.now();
    setDownloading(true);
    setErrors([]);
    setFileProgress({});
    setDownloadedCount(0);
    progressRef.current = 0;

    if (GA_MEASUREMENT_ID) {
      trackUserInteraction('start_batch_download', 'download', useZip ? 'zip' : 'individual');
    }

    const mergedUrls = Array.from(new Set([
      ...urls,
      ...parseManualUrls(manualUrls)
    ]));

    const urlsToDownload = skipDownloaded 
      ? mergedUrls.filter(url => !downloadedUrlsRef.current.has(url))
      : mergedUrls;

    if (urlsToDownload.length > 0) {
      try {
        const { allErrors, zip } = await downloadInBatches(urlsToDownload);

        if (useZip && zip) {
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const zipUrl = window.URL.createObjectURL(zipBlob);
          createdBlobUrlsRef.current.add(zipUrl);
          
          const link = document.createElement('a');
          link.href = zipUrl;
          link.download = `filedownloader.in_${timestamp}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            window.URL.revokeObjectURL(zipUrl);
            createdBlobUrlsRef.current.delete(zipUrl);
          }, 1000);
        }

        const totalTime = Date.now() - startTime;
        if (GA_MEASUREMENT_ID) {
          trackBatchDownload(
            urlsToDownload.length,
            urlsToDownload.length - allErrors.length,
            allErrors.length,
            useZip,
            totalTime
          );
        }

        setErrors(allErrors);
      } catch (error) {
        console.error('Download batch error:', error);
        setErrors([{ url: 'Batch download', error: 'Unexpected error during batch download' }]);
        if (GA_MEASUREMENT_ID) {
          trackError('batch_download', error.message, 'handleDownloadAll');
        }
      }
    }

    setDownloading(false);
  };

  const handleReset = () => {
    if (GA_MEASUREMENT_ID) {
      trackUserInteraction('reset', 'action', 'reset_all');
    }
    
    createdBlobUrlsRef.current.forEach(url => {
      window.URL.revokeObjectURL(url);
    });
    createdBlobUrlsRef.current.clear();
    
    setProgress(0);
    setErrors([]);
    setUrls([]);
    setFile(null);
    setUseZip(false);
    setFileProgress({});
    setDownloadedCount(0);
    setManualUrls('');
    setProxyStatus({});
    setSkipDownloaded(false);
    downloadedUrlsRef.current = new Set();
    progressRef.current = 0;
    localStorage.removeItem('fileDownloaderState');
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ mb: 3 }}>
        <Toolbar>
          <Typography variant="h6" component="div">
            File Downloader
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {mergedUrls.length > 0 && (
            <DownloadControls
              mergedUrls={mergedUrls}
              handleReset={handleReset}
              handleDownloadAll={handleDownloadAll}
              downloading={downloading}
              progress={progress}
              useZip={useZip}
              setUseZip={setUseZip}
              skipDownloaded={skipDownloaded}
              setSkipDownloaded={setSkipDownloaded}
              downloadedUrlsRef={downloadedUrlsRef}
            />
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md">
        <Box sx={{ my: 4, minHeight: "70vh", display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
          <>
            <Paper sx={{ p: 3, mb: 3, minWidth: "80vw" }}>
              <FileUpload
                file={file}
                handleFileUpload={handleFileUpload}
                manualUrls={manualUrls}
                setManualUrls={setManualUrls}
                fileInputRef={fileInputRef}
              />
            </Paper>
            {mergedUrls.length > 0 && (
              <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Found URLs ({mergedUrls.length})
                  </Typography>
                  <Box sx={{ 
                    display: 'flex', 
                    gap: 3, 
                    alignItems: 'center',
                    pl: 1
                  }}>
                    <FormControlLabel
                      control={<Checkbox checked={useZip} onChange={(e) => setUseZip(e.target.checked)} />}
                      label="Download as ZIP"
                    />
                    <FormControlLabel
                      control={<Checkbox checked={skipDownloaded} onChange={(e) => setSkipDownloaded(e.target.checked)} />}
                      label="Skip Downloaded"
                    />
                  </Box>
                </Box>
                {downloading && (
                  <Box sx={{ 
                    mt: 2, 
                    p: 2, 
                    backgroundColor: 'rgba(25, 118, 210, 0.04)',
                    borderRadius: 2,
                    border: '1px solid rgba(25, 118, 210, 0.12)'
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#1976d2' }}>
                        {Math.round(progress)}% Complete
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Downloaded {downloadedCount} of {mergedUrls.length} files
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={progress}
                      sx={{ 
                        height: 8, 
                        borderRadius: 4,
                        backgroundColor: 'rgba(25, 118, 210, 0.12)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: '#1976d2',
                          borderRadius: 4
                        }
                      }}
                    />
                  </Box>
                )}
                <UrlList
                  mergedUrls={mergedUrls}
                  downloading={downloading}
                  fileProgress={fileProgress}
                  proxyStatus={proxyStatus}
                  downloadedUrlsRef={downloadedUrlsRef}
                  errors={errors}
                />
              </Paper>
            )}
          </>
        </Box>
      </Container>
    </Box>
  );
}

export default App;