// Polyfill for pdfjs-dist in Node
if (!global.DOMMatrix) {
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
            this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
            this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
            this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
        }
    };
}

const { pdf } = require('pdf-to-img');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        const filePath = 'd:\\Presentation_AI_Agent\\presentation-agent\\uploads\\1778150183198-mediRag_literature_survey.pdf';
        const { pdf } = await import('pdf-to-img');
        const document = await pdf(filePath, { scale: 1 });
        let counter = 0;
        for await (const image of document) {
            counter++;
            console.log(`Page ${counter} converted`);
            if (counter >= 1) break; // Just test one page
        }
        console.log('Success');
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
