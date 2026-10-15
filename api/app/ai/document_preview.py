import asyncio
from io import BytesIO
from urllib.parse import urlparse

import httpx
import pypdfium2 as pdfium  # type: ignore[import-untyped]
from cachetools import TTLCache

previews: TTLCache = TTLCache(maxsize=32, ttl=900)
render_limit = asyncio.Semaphore(1)


async def document_preview(service, url: str) -> bytes | None:
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'cdn.simplize.vn' or not parsed.path.lower().endswith('.pdf'):
        return None
    if url in previews:
        return previews[url]
    async with render_limit:
        if url in previews:
            return previews[url]
        try:
            async with service.http.client.stream('GET', url, follow_redirects=False, timeout=12) as response:
                response.raise_for_status()
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 8_000_000:
                        return None
            def render():
                with pdfium.PdfDocument(bytes(data)) as pdf:
                    page = pdf[0]
                    bitmap = page.render(scale=min(.7, 420/page.get_width()))
                    image = bitmap.to_pil()
                    output = BytesIO()
                    image.save(output, format='PNG')
                    bitmap.close()
                    page.close()
                    return output.getvalue()
            result = await asyncio.to_thread(render)
            previews[url] = result
            return result
        except (httpx.HTTPError, pdfium.PdfiumError, ValueError, IndexError):
            return None
