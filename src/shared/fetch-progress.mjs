// Discourse's raw topic endpoint returns up to 100 posts per page.
const RAW_POSTS_PER_PAGE = 100;

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function getTopicPagination(metadata) {
  const postStream = metadata?.post_stream;
  const streamCount = Array.isArray(postStream?.stream)
    ? postStream.stream.length
    : null;
  const totalPosts = toPositiveInteger(streamCount)
    ?? toPositiveInteger(metadata?.posts_count);

  if (!totalPosts) {
    return null;
  }

  return {
    totalPosts,
    pageSize: RAW_POSTS_PER_PAGE,
    totalPages: Math.ceil(totalPosts / RAW_POSTS_PER_PAGE)
  };
}

export function calculateFetchProgress({
  currentPage,
  totalPages,
  totalPosts,
  pageSize,
  averageRequestMs,
  requestDelayMs = 0,
  concurrency = 1
}) {
  const hasKnownTotal = Number.isInteger(totalPages) && totalPages > 0;
  const completedPages = Math.max(0, Number(currentPage) || 0);
  const remainingPages = hasKnownTotal
    ? Math.max(0, totalPages - completedPages)
    : null;
  const percent = hasKnownTotal
    ? Math.min(100, Math.round((completedPages / totalPages) * 100))
    : null;
  const processedPosts = totalPosts && pageSize
    ? Math.min(totalPosts, completedPages * pageSize)
    : null;
  const parallelRequests = Math.max(1, Math.floor(Number(concurrency) || 1));
  const remainingWaves = remainingPages === null
    ? null
    : Math.ceil(remainingPages / parallelRequests);
  const etaMs = remainingWaves !== null && averageRequestMs >= 0
    ? Math.ceil(remainingWaves * (averageRequestMs + requestDelayMs))
    : null;

  return {
    currentPage: completedPages,
    totalPages: hasKnownTotal ? totalPages : null,
    totalPosts: totalPosts ?? null,
    processedPosts,
    percent,
    etaMs
  };
}

export function formatEta(etaMs) {
  if (!Number.isFinite(etaMs) || etaMs < 0) {
    return 'Calculating ETA…';
  }

  if (etaMs === 0) {
    return 'Finishing…';
  }

  const totalSeconds = Math.max(1, Math.ceil(etaMs / 1000));
  if (totalSeconds < 60) {
    return `ETA ~${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `ETA ~${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
