import React from 'react';
import { UploadCloud } from 'lucide-react';

interface Props {
  isDragging: boolean;
  targetDeviceName?: string;
  onDropFiles: (files: FileList) => void;
}

export const DropZone: React.FC<Props> = ({
  isDragging,
  targetDeviceName,
  onDropFiles,
}) => {
  if (!isDragging) return null;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onDropFiles(e.dataTransfer.files);
        }
      }}
      className="fixed inset-0 z-50 bg-accent-selected-bg/90 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-accent m-4 rounded-3xl animate-in fade-in duration-150"
    >
      <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center text-accent mb-6 shadow-sm animate-bounce">
        <UploadCloud className="w-10 h-10" />
      </div>

      <h2 className="text-2xl font-bold text-text mb-2">
        Seret dan lepas file di sini
      </h2>
      <p className="text-sm text-text-secondary font-medium max-w-md text-center">
        untuk dikirim langsung ke <strong className="text-accent underline">{targetDeviceName || 'ponsel Android'}</strong> melalui jaringan lokal Wi-Fi.
      </p>
    </div>
  );
};
