import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useSessionStore } from '../store/sessionStore';
import { uploadFile } from '../api/client';
import { useDetectStructure, useAnalyzeSession } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function UploadZone() {
  // NOTE: do NOT call setSession until ALL three steps complete.
  // Calling it early mounts DataGrid before data is ready, causing flicker.
  const { setSession } = useSessionStore();
  const { toast } = useToast();

  const detectStructure = useDetectStructure();
  const analyzeSession = useAnalyzeSession();

  const [isUploading, setIsUploading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('Uploading file...');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    try {
      setIsUploading(true);
      setLoadingText('Uploading file...');

      const uploadRes = await uploadFile(file);
      const { session_id, original_filename, sheets } = uploadRes;

      // Step 2: detect structure — do NOT setSession yet
      const sheetToUse = sheets[0];
      if (sheetToUse) {
        setLoadingText('Detecting table structure...');
        await detectStructure.mutateAsync({
          sessionId: session_id,
          data: { sheet_name: sheetToUse },
        });
      }

      // Step 3: analyze — still do NOT setSession yet
      setLoadingText('Scanning column types and finding issues...');
      await analyzeSession.mutateAsync({ sessionId: session_id });

      // Only NOW flip the store — DataGrid mounts with fully-prepared data
      setSession(session_id, original_filename, sheets);

      toast({ title: 'Ready', description: 'File analyzed successfully.' });
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [setSession, detectStructure, analyzeSession, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/tab-separated-values': ['.tsv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
  });

  if (isUploading) {
    return (
      <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-border rounded-xl bg-card">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="font-medium animate-pulse">{loadingText}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`flex h-full w-full cursor-pointer flex-col items-center justify-center border-2 border-dashed rounded-xl transition-colors duration-200 ease-in-out ${
        isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <UploadCloud className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-foreground tracking-tight">Drop your data here</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-[300px]">
            Supports .xlsx, .xls, .csv, and .tsv. We'll automatically detect the structure, infer
            types, and find issues.
          </p>
        </div>
        <div className="flex gap-4 mt-4 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5 bg-accent px-2 py-1 rounded-md">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </span>
          <span className="flex items-center gap-1.5 bg-accent px-2 py-1 rounded-md">
            <FileSpreadsheet className="w-4 h-4" /> CSV
          </span>
        </div>
      </div>
    </div>
  );
}
