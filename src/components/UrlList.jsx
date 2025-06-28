import { List, ListItem, ListItemText, Typography, Box, Tooltip, CircularProgress, LinearProgress, Button } from '@mui/material';

const UrlList = ({ mergedUrls, downloading, fileProgress, proxyStatus, downloadedUrlsRef, errors }) => {
  if (mergedUrls.length === 0) {
    return null;
  }

  const urlErrors = (errors || []).reduce((acc, error) => {
    if (error.url) {
      acc[error.url] = error.error;
    }
    return acc;
  }, {});

  const getStatusInfo = (url) => {
    if (urlErrors[url]) {
      return { type: 'error', message: urlErrors[url] };
    }
    if (proxyStatus[url]?.startsWith('success-')) {
      return { type: 'proxy-success', service: proxyStatus[url].split('-')[1] };
    }
    if (downloadedUrlsRef.current.has(url)) {
      return { type: 'success', message: 'Downloaded successfully' };
    }
    if (downloading && (fileProgress[url] > 0 || proxyStatus[url] === 'retrying')) {
      return { type: 'downloading', progress: fileProgress[url] || 0 };
    }
    return { type: 'pending' };
  };

  const isCorsError = (errorMessage) => {
    return errorMessage && (
      errorMessage.includes('CORS') || 
      errorMessage.includes('proxy services failed') ||
      errorMessage.includes('blocked')
    );
  };

  return (
    <List sx={{ 
      '& .MuiListItem-root': {
        borderRadius: 2,
        mb: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.02)',
        border: '1px solid rgba(0, 0, 0, 0.05)'
      }
    }}>
      {mergedUrls.sort((a,b) => {
          const progressA = fileProgress[a] || 0;
          const progressB = fileProgress[b] || 0;
          const statusA = getStatusInfo(a);
          const statusB = getStatusInfo(b);
          
          // Sort by: completed downloads first, then errors, then in-progress
          if (statusA.type === 'success' || statusA.type === 'proxy-success') return -1;
          if (statusB.type === 'success' || statusB.type === 'proxy-success') return 1;
          if (statusA.type === 'error' && statusB.type !== 'error') return -1;
          if (statusB.type === 'error' && statusA.type !== 'error') return 1;
          
          return progressB - progressA;
      }).map((url, index) => {
        const status = getStatusInfo(url);
        
        return (
          <ListItem key={index} sx={{ 
            py: 2,
            px: 2,
            flexDirection: 'column',
            alignItems: 'stretch',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)'
            },
            // Add red border for error items
            ...(status.type === 'error' && {
              borderColor: 'rgba(244, 67, 54, 0.3)',
              backgroundColor: 'rgba(244, 67, 54, 0.02)'
            })
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
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
              
              {/* Status Indicators */}
              {status.type === 'downloading' && (
                <Tooltip title="Downloading..." arrow>
                  <CircularProgress size={16} sx={{ color: proxyStatus[url] === 'retrying' ? '#ff9800' : '#1976d2' }} />
                </Tooltip>
              )}
              {status.type === 'proxy-success' && (
                <Tooltip title={`Downloaded via ${status.service} proxy`} arrow>
                  <Box sx={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    backgroundColor: '#ff9800',
                    border: '2px solid #4caf50'
                  }} />
                </Tooltip>
              )}
              {status.type === 'success' && (
                <Tooltip title="Downloaded successfully" arrow>
                  <Box sx={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    backgroundColor: '#4caf50'
                  }} />
                </Tooltip>
              )}
              {status.type === 'error' && (
                <Tooltip title="Download failed" arrow>
                  <Box sx={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    backgroundColor: '#f44336'
                  }} />
                </Tooltip>
              )}
            </Box>

            {/* Progress Bar for Downloads */}
            {status.type === 'downloading' && (
              <Box sx={{ width: '100%', mt: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {proxyStatus[url] === 'retrying' ? 'Downloading via proxy...' : 'Downloading...'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {status.progress}%
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={status.progress}
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
            )}

            {/* Error Display - Contained within row */}
            {status.type === 'error' && (
              <Box sx={{ 
                mt: 1,
                p: 1.5,
                backgroundColor: 'rgba(244, 67, 54, 0.08)',
                borderRadius: 1,
                border: '1px solid rgba(244, 67, 54, 0.2)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  <Box sx={{ 
                    width: 4, 
                    height: 4, 
                    borderRadius: '50%', 
                    backgroundColor: '#f44336',
                    mt: 0.5,
                    flexShrink: 0
                  }} />
                  <Typography variant="body2" sx={{ color: '#d32f2f', fontWeight: 500 }}>
                    {status.message}
                  </Typography>
                </Box>
                
                {isCorsError(status.message) && (
                  <Box sx={{ ml: 1.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                      💡 This file is blocked by CORS restrictions. Try downloading it directly:
                    </Typography>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => window.open(url, '_blank')}
                      sx={{ 
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        py: 0.5,
                        px: 1,
                        borderColor: 'rgba(244, 67, 54, 0.5)',
                        color: '#d32f2f',
                        '&:hover': {
                          borderColor: '#d32f2f',
                          backgroundColor: 'rgba(244, 67, 54, 0.04)'
                        }
                      }}
                    >
                      Open in New Tab
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </ListItem>
        );
      })} 
    </List>
  );
};

export default UrlList;
