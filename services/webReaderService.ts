export async function readWebpage(url: string): Promise<{ title: string; content: string; url: string }> {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      'Accept': 'application/json',
      'X-With-Links-Summary': 'true'
    }
  });

  const json = await response.json();

  if (!response.ok || !json.data) {
    throw new Error(response.statusText || 'Failed to read webpage');
  }

  const content = json.data.content || '';

  return {
    title: json.data.title || url,
    content: content,
    url
  };
}

export async function searchWeb(query: string): Promise<any[]> {
  try {
    const targetUrl = 'https://s.jina.ai/' + encodeURIComponent(query);
    const jinaApiKey = 'jina_82b720fa9f1a46b783bac7cdddaf4253k4lTEOCN35MGt4N55KDxjU-uYVG1';
    
    let response;
    try {
      // Try direct fetch first (Jina usually supports CORS)
      response = await fetch(targetUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${jinaApiKey}`
        }
      });
    } catch (directError) {
      // Fallback to proxy if direct fetch fails (e.g., CORS issue)
      const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);
      response = await fetch(proxyUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${jinaApiKey}`
        }
      });
    }

    if (!response.ok) {
      let errorText = response.statusText;
      try {
        errorText = await response.text();
      } catch (e) {}
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const json = await response.json();

    if (!json.data || !Array.isArray(json.data)) {
      return [];
    }

    return json.data.map((item: any) => ({
      title: item.title,
      url: item.url,
      description: item.description
    }));
  } catch (error: any) {
    throw new Error(`Search failed: ${error.message}`);
  }
}

export async function fetchRawHtml(url: string): Promise<string> {
  // Using a reliable CORS proxy to get the raw HTML
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error(`Failed to fetch raw HTML: ${response.statusText}`);
  const html = await response.text();
  return html;
}
