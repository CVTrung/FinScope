export function requestError(cause) {
  if (cause instanceof TypeError && /fetch|network|load failed/i.test(cause.message))
    return 'The FinScope backend cannot be reached. Start the local server, then try again.';
  return cause.message || 'Request failed. Please try again.';
}
