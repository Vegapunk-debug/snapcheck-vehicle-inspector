import { useRef, useState } from "react";

type Props = {
  onFiles: (files: File[]) => void;
};

const FILE_INPUT_ID = "snapcheck-file-input";

export function Dropzone({ onFiles }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Filter to image files, hand off to parent.
  const handleSelectedFiles = (files: FileList | null | undefined) => {
    const imageFiles = Array.from(files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length) onFiles(imageFiles);
  };

  return (
    <label
      className={`dropzone ${isDragOver ? "is-over" : ""}`}
      htmlFor={FILE_INPUT_ID}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        handleSelectedFiles(event.dataTransfer?.files);
      }}
      onPaste={(event) => handleSelectedFiles(event.clipboardData?.files)}
    >
      <input
        ref={fileInputRef}
        id={FILE_INPUT_ID}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          handleSelectedFiles(event.currentTarget.files);
          // Reset so re-picking same file fires onChange.
          event.currentTarget.value = "";
        }}
      />

      <svg
        className="dropzone-icon"
        viewBox="0 0 24 24"
        width="42"
        height="42"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>

      <div className="dropzone-title">Drop vehicle images here</div>
      <div className="dropzone-sub">or click to browse · multiple files supported</div>
      <div className="dropzone-shortcut">
        <kbd>⌘</kbd> + <kbd>V</kbd> to paste from clipboard
      </div>
    </label>
  );
}
