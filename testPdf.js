const OpenAI = require('openai');
const fs = require('fs');

const openrouter = new OpenAI({
  apiKey: 'REDACTED_OPENROUTER_KEY',
  baseURL: 'https://openrouter.ai/api/v1'
});

async function testPdf() {
  const pdfBase64 = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 100 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000221 00000 n\n0000000309 00000 n\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n404\n%%EOF').toString('base64');

  try {
    const res = await openrouter.chat.completions.create({
      model: 'google/gemini-1.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is written in this PDF?' },
            { type: 'image_url', image_url: { url: `data:application/pdf;base64,${pdfBase64}` } }
          ]
        }
      ]
    });
    console.log('Response:', res.choices[0].message.content);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testPdf();
