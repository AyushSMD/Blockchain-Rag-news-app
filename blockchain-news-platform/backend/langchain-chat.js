// langchain-chat.js - LangChain integration with Groq
const https = require('https');

class LangChainGroqChat {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GROQ_API_KEY;
    this.model = 'llama-3.1-8b-instant'; // Fast and capable model
    this.apiUrl = 'api.groq.com';
  }

  async chat(message, context = {}) {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured. Set GROQ_API_KEY environment variable.');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    
    const requestData = JSON.stringify({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 1.0,
      max_tokens: 1024,
      top_p: 1,
      stream: false
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.apiUrl,
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(requestData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.error) {
              reject(new Error(response.error.message || 'Groq API error'));
              return;
            }

            const aiMessage = response.choices[0]?.message?.content || 'No response generated';
            resolve({
              response: aiMessage,
              model: response.model,
              usage: response.usage
            });
          } catch (error) {
            reject(new Error(`Failed to parse Groq response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Groq API request failed: ${error.message}`));
      });

      req.write(requestData);
      req.end();
    });
  }

  buildSystemPrompt(context) {
    let prompt = `You are an AI news assistant for a blockchain-based news platform. Your role is to help users find, understand, and analyze news articles.

Key responsibilities:
1. Answer questions about articles in the blockchain
2. Summarize articles clearly and concisely
3. Provide context and insights about news topics
4. Help users discover relevant articles
5. Explain trust scores and article credibility

Guidelines:
- Be concise but informative
- Use natural, conversational language
- Focus on facts from the articles
- Explain complex topics simply
- When summarizing, capture key points in 2-3 sentences`;

    if (context.articles && context.articles.length > 0) {
      prompt += `\n\nAvailable articles in the blockchain:\n`;
      context.articles.forEach((article, index) => {
        prompt += `\n${index + 1}. "${article.title}"`;
        if (article.content) {
          prompt += `\n   Summary: ${article.content.substring(0, 200)}...`;
        }
        if (article.trustScore) {
          prompt += `\n   Trust Score: ${article.trustScore}%`;
        }
      });
    }

    if (context.selectedArticle) {
      prompt += `\n\nUser is asking about this specific article:`;
      prompt += `\nTitle: "${context.selectedArticle.title}"`;
      if (context.selectedArticle.content) {
        prompt += `\nContent: ${context.selectedArticle.content}`;
      }
      if (context.selectedArticle.trustScore) {
        prompt += `\nTrust Score: ${context.selectedArticle.trustScore}%`;
      }
    }

    return prompt;
  }

  async summarizeArticle(article) {
    const message = `Please provide a concise 2-3 sentence summary of this article: "${article.title}". ${article.content ? 'Content: ' + article.content : ''}`;
    
    try {
      const result = await this.chat(message, { selectedArticle: article });
      return result.response;
    } catch (error) {
      console.error('Summarization error:', error);
      return `Unable to generate summary: ${error.message}`;
    }
  }

  async analyzeArticles(articles, query) {
    const message = `Based on these articles, ${query}`;
    
    try {
      const result = await this.chat(message, { articles });
      return result.response;
    } catch (error) {
      console.error('Analysis error:', error);
      return `Unable to analyze: ${error.message}`;
    }
  }
}

module.exports = LangChainGroqChat;