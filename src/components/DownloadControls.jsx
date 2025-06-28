import { Box, Button, Tooltip, IconButton, CircularProgress } from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';

const DownloadControls = ({
  mergedUrls,
  handleReset,
  handleDownloadAll,
  downloading,
  progress,
  useZip,
}) => {
  return (
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
        startIcon={downloading ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : <Download />}
      >
        {downloading
          ? `Downloading...${progress ? ` ${progress.toFixed(0)}%` : ''}`
          : `${useZip ? 'Download as ZIP' : `Download ${mergedUrls.length === 1 ? 'File' : `${mergedUrls.length} Files`}`}`}
      </Button>
    </Box>
  );
};

export default DownloadControls;
