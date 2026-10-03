const storageKey = 'finscope-news-tavily-state';
let memoryState = null;

export function loadNewsState() {
  try {
    const saved = memoryState || JSON.parse(sessionStorage.getItem(storageKey));
    if (
      saved &&
      typeof saved.query === 'string' &&
      (!saved.result || Array.isArray(saved.result.articles))
    )
      return saved;
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
  return { query: '', days: 30, result: null };
}

export function saveNewsState(state) {
  memoryState = state;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Keep the in-memory copy for page navigation.
  }
}
