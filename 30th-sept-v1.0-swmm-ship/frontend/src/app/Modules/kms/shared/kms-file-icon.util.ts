/** File-type icon + color, matched to the Django DMS app's `file_icons` template tag (by extension). */
export interface FileIconInfo {
  iconName: string;
  colorClass: string;
}

const ICON_MAP: Record<string, FileIconInfo> = {
  pdf: { iconName: "file-text", colorClass: "text-red-500" },
  doc: { iconName: "file-text", colorClass: "text-blue-500" },
  docx: { iconName: "file-text", colorClass: "text-blue-500" },
  xls: { iconName: "file-spreadsheet", colorClass: "text-green-500" },
  xlsx: { iconName: "file-spreadsheet", colorClass: "text-green-500" },
  csv: { iconName: "file-spreadsheet", colorClass: "text-green-500" },
  ppt: { iconName: "file-text", colorClass: "text-orange-500" },
  pptx: { iconName: "file-text", colorClass: "text-orange-500" },
  jpg: { iconName: "image", colorClass: "text-cyan-500" },
  jpeg: { iconName: "image", colorClass: "text-cyan-500" },
  png: { iconName: "image", colorClass: "text-cyan-500" },
  gif: { iconName: "image", colorClass: "text-cyan-500" },
  zip: { iconName: "archive", colorClass: "text-gray-500" },
  rar: { iconName: "archive", colorClass: "text-gray-500" },
};

const DEFAULT_ICON: FileIconInfo = { iconName: "file", colorClass: "text-gray-400" };

export function getFileIcon(fileName: string | null | undefined): FileIconInfo {
  if (!fileName) return DEFAULT_ICON;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ICON_MAP[ext] ?? DEFAULT_ICON;
}
