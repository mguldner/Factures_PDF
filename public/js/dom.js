// ─── Cache des éléments DOM ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

export const screenUpload      = $('screen-upload');
export const screenProcessing  = $('screen-processing');
export const screenReview      = $('screen-review');
export const screenNoCredits   = $('screen-no-credits');
export const creditsBadge      = $('credits-badge');
export const creditsText       = $('credits-text');
export const trialBanner       = $('trial-banner');
export const bannerCredits     = $('banner-credits');
export const btnCloseBanner    = $('btn-close-banner');
export const dropZone          = $('drop-zone');
export const fileInput         = $('file-input');
export const invoicesContainer = $('invoices-container');
export const confirmCheck      = $('confirm-check');
export const btnDownload       = $('btn-download');
export const exportSection     = $('export-section');
export const btnNewInvoice     = $('btn-new-invoice');
export const btnBuy            = $('btn-buy');
export const toast             = $('toast');
export const toastMessage      = $('toast-message');
export const processingTitle   = $('processing-title');
export const processingMsg     = $('processing-msg');
