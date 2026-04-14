import fetch from 'node-fetch';

async function test() {
  const targetUrl = 'https://s.jina.ai/' + encodeURIComponent('test');
  const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);
  console.log('Fetching:', proxyUrl);
  try {
    const response = await fetch(proxyUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    console.log('Status:', response.status, response.statusText);
    const text = await response.text();
    console.log('Response:', text.substring(0, 200));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
