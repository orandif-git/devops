import * as React from "react";

/** Small line icons drawn as SVG (the same look on every system; emoji and symbol characters vary with the installed fonts). */
type P = { size?: number };
const base = (d: React.ReactNode, size = 16) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: "block", flex: "none" }}>{d}</svg>;

export const IconExpandAll = ({ size }: P = {}) => base(<><path d="M3 6l5-3.5L13 6" /><path d="M3 10l5 3.5L13 10" /></>, size);          // arrows pointing apart: show everything
export const IconCollapseAll = ({ size }: P = {}) => base(<><path d="M3 2.5l5 3.5 5-3.5" /><path d="M3 13.5L8 10l5 3.5" /></>, size);     // arrows pointing together: hide the detail
export const IconFullScreen = ({ size }: P = {}) => base(<><path d="M2.5 6V2.5H6" /><path d="M10 2.5h3.5V6" /><path d="M13.5 10v3.5H10" /><path d="M6 13.5H2.5V10" /></>, size);
export const IconExitFullScreen = ({ size }: P = {}) => base(<><path d="M6 2.5V6H2.5" /><path d="M13.5 6H10V2.5" /><path d="M10 13.5V10h3.5" /><path d="M2.5 10H6v3.5" /></>, size);
export const IconDownload = ({ size }: P = {}) => base(<><path d="M8 2v8" /><path d="M4.5 7L8 10.5 11.5 7" /><path d="M2.5 13.5h11" /></>, size);
export const IconRefresh = ({ size }: P = {}) => base(<><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13 2.5V5h-2.5" /></>, size);
export const IconFilter = ({ size }: P = {}) => base(<path d="M2 3h12L9.5 8.5V13l-3-1.5V8.5z" />, size);
export const IconStats = ({ size }: P = {}) => base(<><path d="M3 13V8" /><path d="M8 13V3" /><path d="M13 13V6" /></>, size);
export const IconLink = ({ size }: P = {}) => base(<><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8" /><path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" /></>, size);
export const IconStar = ({ filled, size = 16 }: P & { filled?: boolean }) => <svg width={size} height={size} viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: "block", flex: "none" }}><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3.1-3 4.3-.6z" /></svg>;
export const IconPencil = ({ size }: P = {}) => base(<><path d="M2.5 13.5l.7-3L11 2.7a1.4 1.4 0 0 1 2 2L5.2 12.8z" /><path d="M9.8 4l2.2 2.2" /></>, size);
export const IconClose = ({ size }: P = {}) => base(<><path d="M3.5 3.5l9 9" /><path d="M12.5 3.5l-9 9" /></>, size);
export const IconPlus = ({ size }: P = {}) => base(<><path d="M8 3v10" /><path d="M3 8h10" /></>, size);
export const IconTrash = ({ size }: P = {}) => base(<><path d="M2.5 4.5h11" /><path d="M6 4.5V3h4v1.5" /><path d="M4 4.5l.7 9h6.6l.7-9" /></>, size);
export const IconSave = ({ size }: P = {}) => base(<><path d="M3 2.5h8l2.5 2.5v8.5H3z" /><path d="M5.5 2.5v3.5h4.5V2.5" /><path d="M5.5 13.5v-4h5v4" /></>, size);
export const IconUndo = ({ size }: P = {}) => base(<><path d="M3.5 6.5h6a3.5 3.5 0 0 1 0 7H6" /><path d="M6 3.5L3 6.5l3 3" /></>, size);
export const IconUp = ({ size }: P = {}) => base(<path d="M3.5 10L8 5.5 12.5 10" />, size);
export const IconDown = ({ size }: P = {}) => base(<path d="M3.5 6L8 10.5 12.5 6" />, size);
export const IconLeft = ({ size }: P = {}) => base(<path d="M10 3.5L5.5 8l4.5 4.5" />, size);
export const IconCopy = ({ size }: P = {}) => base(<><rect x="5.5" y="5.5" width="8" height="8" rx="1.2" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>, size);
export const IconSearch = ({ size }: P = {}) => base(<><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" /></>, size);
export const IconOpen = ({ size }: P = {}) => base(<><path d="M9 2.5h4.5V7" /><path d="M13.5 2.5L7.5 8.5" /><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></>, size);
export const IconSheet = ({ size }: P = {}) => base(<><rect x="2.5" y="2.5" width="11" height="11" rx="1.2" /><path d="M2.5 6.5h11M2.5 10h11M6.5 2.5v11" /></>, size);
export const IconUpload = ({ size }: P = {}) => base(<><path d="M8 10V2" /><path d="M4.5 5L8 1.5 11.5 5" /><path d="M2.5 13.5h11" /></>, size);
