import { Box, Button, Typography } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';

const FileUpload = ({
  file,
  handleFileUpload,
  manualUrls,
  setManualUrls,
  fileInputRef,
}) => {
  return (
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
          Upload Excel/CSV File
        </Button>
      </label>
      {file && (
        <Typography variant="body2" color="text.secondary">
          Selected file: {file.name}
        </Typography>
      )}
      <Box sx={{ width: '90%', mt: 2, justifyContent: 'center', alignItems: 'center' }}>
        <Typography variant="subtitle1" gutterBottom>
          Or paste file URLs (one per line, comma, or space separated):
        </Typography>
        <br />
        <textarea
          value={manualUrls}
          onChange={(e) => setManualUrls(e.target.value)}
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
          onFocus={(e) => (e.target.style.borderColor = '#646cff')}
          onBlur={(e) => (e.target.style.borderColor = '#ccc')}
        />
      </Box>
    </Box>
  );
};

export default FileUpload;
