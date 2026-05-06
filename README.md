# AI Presentation Agent

A multi-modal AI Presentation Agent that seamlessly converts your static presentations (PPTX/PDF) into an interactive, voice-narrated experience. 

It acts as an intelligent co-presenter: reading your slides, understanding the underlying speaker notes, generating human-like audio narration, and dynamically answering audience questions in real-time.

## ✨ Features

- **Slide-to-Image Conversion:** Automatically rasterizes PPTX slides to high-quality images using native OS-level COM automation (Windows).
- **Intelligent Narration:** Extracts both slide text and hidden speaker notes to generate contextually accurate, conversational narration.
- **On-the-fly TTS:** Converts the AI-generated narration into audio on the fly using native Node.js text-to-speech.
- **Interactive Q&A:** Pause the presentation at any time and use your microphone to ask questions. The AI will analyze the entire presentation context to answer.
- **Presentation Controls:** Full-screen mode, Fit/Fill controls, Zooming, and Auto-advance features.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- An API key from [OpenRouter](https://openrouter.ai/)
- (Optional but Recommended) Microsoft PowerPoint installed (for perfect PPTX to PNG extraction on Windows)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/presentation-agent.git
   cd presentation-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Copy the example environment file and add your OpenRouter API key.
   ```bash
   cp .env.example .env
   ```
   Open `.env` and replace `your_openrouter_api_key_here` with your actual key.

4. Start the Server:
   ```bash
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`.

## 🛠️ Built With

- **Frontend:** Vanilla HTML/CSS/JS with a custom-built sleek, responsive UI.
- **Backend:** Node.js, Express, Multer
- **AI/LLM Routing:** OpenRouter SDK
- **File Parsing:** `pdf-parse`, `jszip`, PowerPoint COM Automation
- **Audio:** `gtts`, Web Speech API

## 📝 Usage

1. Drag and drop a `.pptx` or `.pdf` file into the upload area.
2. Click **Play Narration** to have the AI begin presenting the first slide.
3. Check the **Auto-advance** box to have the presentation run autonomously.
4. Click **💬 Q&A** to open the floating panel and ask the AI a question about the slides.

## 📄 License

This project is licensed under the MIT License.
