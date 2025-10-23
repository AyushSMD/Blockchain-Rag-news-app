import React, { useState, useEffect, useRef } from 'react';
import { Search, Upload, ThumbsUp, ThumbsDown, ExternalLink, Database, Sparkles, BookOpen, TrendingUp, Zap, Globe, Users, Clock, Award, MessageCircle, Send, X, BarChart3, AlertCircle } from 'lucide-react';

const HTTP_PORT=process.env.HTTP_PORT || 3001
const API_URL = `http://localhost:${HTTP_PORT}/api`;

const BlockchainNewsApp = () => {
  const [articles, setArticles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newArticle, setNewArticle] = useState({ title: '', url: '', content: '' });
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('feed');
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [topNews, setTopNews] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadInitialData();
    const interval = setInterval(loadNodeStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadInitialData = async () => {
    await Promise.all([
      loadArticles(),
      loadNodeStatus()
    ]);
    setLoading(false);
  };

  const loadNodeStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      setNodeStatus(data);
    } catch (error) {
      console.error('Failed to load node status:', error);
    }
  };

  const loadArticles = async () => {
    try {
      const response = await fetch(`${API_URL}/articles`);
      const data = await response.json();
      setArticles(data.articles || []);
      updateTopNews(data.articles || []);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  const updateTopNews = (articleList) => {
    const sorted = [...articleList]
      .sort((a, b) => {
        const scoreA = calculateTrustScore(a) + ((a.votes || 0) - (a.downvotes || 0)) * 2;
        const scoreB = calculateTrustScore(b) + ((b.votes || 0) - (b.downvotes || 0)) * 2;
        return scoreB - scoreA;
      })
      .slice(0, 3);
    setTopNews(sorted);
  };

  const calculateTrustScore = (article) => {
    let score = 50;
    if (article.url?.includes('https')) score += 10;
    if (article.content?.length > 200) score += 10;
    const netVotes = (article.votes || 0) - (article.downvotes || 0);
    if (netVotes > 0) score += Math.min(netVotes * 2, 20);
    if (article.peerVerifications) score += article.peerVerifications * 5;
    
    const trustedDomains = ['reuters.com', 'bbc.com', 'apnews.com', 'nytimes.com'];
    for (const domain of trustedDomains) {
      if (article.url?.includes(domain)) {
        score += 15;
        break;
      }
    }
    return Math.min(100, Math.max(0, score));
  };

  const connectWallet = () => {
    const address = '0x' + Math.random().toString(16).substr(2, 40);
    setUserAddress(address);
    setWalletConnected(true);
  };

  const uploadArticle = async () => {
    if (!newArticle.title) {
      return;
    }

    if (!walletConnected) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newArticle)
      });

      const data = await response.json();
      
      if (data.success) {
        setNewArticle({ title: '', url: '', content: '' });
        await loadArticles();
        setActiveTab('feed');
      }
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const voteArticle = async (articleId, voteType) => {
    if (!walletConnected) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/articles/${articleId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType })
      });

      const data = await response.json();
      
      if (data.success) {
        await loadArticles();
        if (searchResults.length > 0) {
          const updatedResults = searchResults.map(r => 
            r.id === articleId ? { ...r, ...data.article } : r
          );
          setSearchResults(updatedResults);
        }
        if (selectedArticle?.id === articleId) {
          setSelectedArticle(data.article);
        }
      }
    } catch (error) {
      console.error('Vote error:', error);
    }
  };

  const searchArticles = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    
    try {
      const response = await fetch(`${API_URL}/search?query=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await response.json();
      // Filter out results with less than 25% relevance
      const filtered = (data.results || []).filter(r => r.relevance >= 25);
      setSearchResults(filtered);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: currentInput,
          articleId: selectedArticle?.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        const aiMessage = {
          role: 'assistant',
          content: data.response,
          articles: data.relevantArticles || [],
          timestamp: Date.now()
        };
        setChatMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Make sure your Groq API key is configured.',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const selectArticle = (article) => {
    setSelectedArticle(article);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Database className="w-16 h-16 mx-auto text-indigo-600 animate-pulse" />
          <p className="mt-4 text-gray-700">Connecting to blockchain network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <Database className="w-8 h-8 text-indigo-600" />
                DecentraNews AI
              </h1>
              <p className="text-gray-600 mt-1">Blockchain News with AI Chat Assistant</p>
            </div>
            <button
              onClick={connectWallet}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                walletConnected
                  ? 'bg-green-500 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {walletConnected ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connect Wallet'}
            </button>
          </div>

          {/* Node Status */}
          {nodeStatus && (
            <div className="flex items-center gap-6 text-sm bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${nodeStatus.status === 'healthy' ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-gray-700">{nodeStatus.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">{nodeStatus.peers} peers</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">Block #{nodeStatus.chainLength}</span>
              </div>
              <div className="ml-auto text-xs text-gray-500">
                {nodeStatus.peers > 0 ? '🌐 Connected to network' : '📡 Local only'}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-lg mb-6">
              <div className="flex border-b overflow-x-auto">
                {[
                  { id: 'feed', label: 'Top News', icon: TrendingUp },
                  { id: 'search', label: 'AI Search', icon: Search },
                  { id: 'upload', label: 'Upload', icon: Upload },
                  { id: 'browse', label: 'All Articles', icon: BookOpen }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'text-indigo-600 border-b-2 border-indigo-600'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <tab.icon className="w-5 h-5 inline mr-2" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* Top News Feed */}
                {activeTab === 'feed' && (
                  <div>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-2">
                        <Award className="w-6 h-6 text-yellow-500" />
                        Top 3 News Stories
                      </h2>
                      <p className="text-gray-600">Highest rated by trust score and votes</p>
                    </div>

                    {topNews.length > 0 ? (
                      <div className="space-y-6">
                        {topNews.map((article, index) => (
                          <div 
                            key={article.id}
                            onClick={() => selectArticle(article)}
                            className={`bg-gradient-to-r from-white to-gray-50 rounded-xl p-6 border-2 ${
                              selectedArticle?.id === article.id ? 'border-indigo-500' : 'border-indigo-200'
                            } shadow-lg hover:shadow-xl transition-all cursor-pointer`}
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0">
                                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                                  <span className="text-3xl font-bold text-white">#{index + 1}</span>
                                </div>
                              </div>
                              
                              <div className="flex-1">
                                <h3 className="text-2xl font-bold text-gray-800 mb-3">{article.title}</h3>
                                
                                <div className="flex flex-wrap gap-3 mb-4">
                                  <div className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                                    <Award className="w-4 h-4" />
                                    Trust: {calculateTrustScore(article)}%
                                  </div>
                                  <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                    <ThumbsUp className="w-4 h-4" />
                                    {article.votes || 0}
                                  </div>
                                  <div className="flex items-center gap-2 bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
                                    <ThumbsDown className="w-4 h-4" />
                                    {article.downvotes || 0}
                                  </div>
                                  {article.blockHeight && (
                                    <div className="flex items-center gap-2 bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                                      Block #{article.blockHeight}
                                    </div>
                                  )}
                                </div>

                                {article.content && (
                                  <p className="text-gray-700 mb-4 line-clamp-2">
                                    {article.content.substring(0, 200)}...
                                  </p>
                                )}

                                <div className="flex gap-3 flex-wrap">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      voteArticle(article.id, 'up');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all disabled:opacity-50"
                                    disabled={!walletConnected}
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                    Upvote
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      voteArticle(article.id, 'down');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50"
                                    disabled={!walletConnected}
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                    Downvote
                                  </button>
                                  {article.url && (
                                    <a
                                      href={article.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {article.url.startsWith('#') ? 'Original' : 'Read'} <ExternalLink className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <Award className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p>No articles yet. Be the first to submit!</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Search Tab */}
                {activeTab === 'search' && (
                  <div>
                    <div className="flex gap-3 mb-6">
                      <input
                        type="text"
                        placeholder="Search for news articles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchArticles()}
                        className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <button
                        onClick={searchArticles}
                        disabled={isSearching}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSearching ? (
                          <>
                            <Sparkles className="w-5 h-5 animate-spin" />
                            Searching...
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            Search
                          </>
                        )}
                      </button>
                    </div>

                    {searchResults.length > 0 ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">
                          Found {searchResults.length} articles (≥25% relevance)
                        </h3>
                        {searchResults.map(article => (
                          <div 
                            key={article.id} 
                            onClick={() => selectArticle(article)}
                            className={`bg-gray-50 rounded-lg p-5 border-2 transition-all cursor-pointer ${
                              selectedArticle?.id === article.id ? 'border-indigo-500' : 'border-gray-200 hover:border-indigo-300'
                            }`}
                          >
                            <h4 className="text-xl font-semibold text-gray-800 mb-2">{article.title}</h4>
                            <div className="flex gap-3 text-sm text-gray-600 mb-3 flex-wrap">
                              <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
                                Trust: {article.trustScore}%
                              </span>
                              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
                                Relevance: {article.relevance.toFixed(1)}%
                              </span>
                              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                                ↑{article.votes || 0}
                              </span>
                              <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full">
                                ↓{article.downvotes || 0}
                              </span>
                              {article.blockHeight && (
                                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                                  Block #{article.blockHeight}
                                </span>
                              )}
                            </div>
                            {article.summary && (
                              <p className="text-gray-700 text-sm mb-3">{article.summary}</p>
                            )}
                            <div className="flex items-center gap-3 flex-wrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  voteArticle(article.id, 'up');
                                }}
                                className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-all text-sm disabled:opacity-50"
                                disabled={!walletConnected}
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  voteArticle(article.id, 'down');
                                }}
                                className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-all text-sm disabled:opacity-50"
                                disabled={!walletConnected}
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                              {article.url && (
                                <a
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {article.url.startsWith('#') ? 'Original' : 'Read'} <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : searchQuery && !isSearching ? (
                      <div className="text-center py-12 text-gray-500">
                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p>No articles found with ≥25% relevance.</p>
                        <p className="text-sm mt-2">Try different keywords or upload relevant articles.</p>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p>Search for news articles to get AI-powered results</p>
                        <p className="text-sm mt-2">Results filtered to show only ≥25% relevance</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Tab */}
                {activeTab === 'upload' && (
                  <div className="max-w-2xl mx-auto">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Submit New Article</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Article Title *</label>
                        <input
                          type="text"
                          value={newArticle.title}
                          onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
                          className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter article title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Article URL (optional)</label>
                        <input
                          type="url"
                          value={newArticle.url}
                          onChange={(e) => setNewArticle({ ...newArticle, url: e.target.value })}
                          className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="https://example.com/article"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave empty for original content</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                        <textarea
                          value={newArticle.content}
                          onChange={(e) => setNewArticle({ ...newArticle, content: e.target.value })}
                          className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-32"
                          placeholder="Article content or summary..."
                        />
                      </div>
                      <button
                        onClick={uploadArticle}
                        className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-semibold disabled:opacity-50"
                        disabled={!walletConnected}
                      >
                        {walletConnected ? 'Submit to Blockchain' : 'Connect Wallet First'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Browse All */}
                {activeTab === 'browse' && (
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">
                      All Articles ({articles.length})
                    </h3>
                    {articles.length > 0 ? (
                      <div className="space-y-4">
                        {articles.map(article => (
                          <div 
                            key={article.id} 
                            onClick={() => selectArticle(article)}
                            className={`bg-gray-50 rounded-lg p-5 border-2 transition-all cursor-pointer ${
                              selectedArticle?.id === article.id ? 'border-indigo-500' : 'border-gray-200 hover:border-indigo-300'
                            }`}
                          >
                            <h4 className="text-xl font-semibold text-gray-800 mb-2">{article.title}</h4>
                            <div className="flex gap-3 text-sm text-gray-600 mb-3 flex-wrap">
                              <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
                                Trust: {calculateTrustScore(article)}%
                              </span>
                              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                                ↑{article.votes || 0}
                              </span>
                              <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full">
                                ↓{article.downvotes || 0}
                              </span>
                              {article.blockHeight && (
                                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                                  Block #{article.blockHeight}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-3 flex-wrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  voteArticle(article.id, 'up');
                                }}
                                className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
                                disabled={!walletConnected}
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  voteArticle(article.id, 'down');
                                }}
                                className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm disabled:opacity-50"
                                disabled={!walletConnected}
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                              {article.url && (
                                <a
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {article.url.startsWith('#') ? 'Original' : 'Read'} <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p>No articles in blockchain yet</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-lg p-6 text-center">
                <div className="text-3xl font-bold text-indigo-600">{articles.length}</div>
                <div className="text-gray-600 mt-1 text-sm">Total Articles</div>
              </div>
              <div className="bg-white rounded-lg shadow-lg p-6 text-center">
                <div className="text-3xl font-bold text-green-600">
                  {nodeStatus ? nodeStatus.chainLength : 0}
                </div>
                <div className="text-gray-600 mt-1 text-sm">Blocks</div>
              </div>
              <div className="bg-white rounded-lg shadow-lg p-6 text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {nodeStatus ? nodeStatus.peers : 0}
                </div>
                <div className="text-gray-600 mt-1 text-sm">Peers</div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - AI Analysis */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 border-2 border-purple-200 sticky top-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-6 h-6 text-purple-600" />
                <h3 className="text-xl font-bold text-gray-800">AI Analysis</h3>
              </div>

              {selectedArticle ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 mb-2 text-lg">{selectedArticle.title}</h4>
                    <div className="flex gap-2 flex-wrap mb-3">
                      <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                        Trust: {calculateTrustScore(selectedArticle)}%
                      </span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        ↑{selectedArticle.votes || 0}
                      </span>
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                        ↓{selectedArticle.downvotes || 0}
                      </span>
                      {selectedArticle.blockHeight && (
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          Block #{selectedArticle.blockHeight}
                        </span>
                      )}
                    </div>
                    
                    {/* Vote buttons in analysis */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => voteArticle(selectedArticle.id, 'up')}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
                        disabled={!walletConnected}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Upvote
                      </button>
                      <button
                        onClick={() => voteArticle(selectedArticle.id, 'down')}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm disabled:opacity-50"
                        disabled={!walletConnected}
                      >
                        <ThumbsDown className="w-4 h-4" />
                        Downvote
                      </button>
                    </div>
                    
                    {/* Read article button */}
                    {selectedArticle.url && (
                      <a
                        href={selectedArticle.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                      >
                        {selectedArticle.url.startsWith('#') ? 'View Original Content' : 'Read Full Article'} <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {selectedArticle.content && (
                    <div className="bg-white rounded-lg p-4">
                      <h5 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-500" />
                        Content Preview
                      </h5>
                      <p className="text-gray-700 text-sm">
                        {selectedArticle.content.substring(0, 300)}...
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Trust Score</p>
                      <p className={`font-semibold text-2xl ${
                        calculateTrustScore(selectedArticle) >= 70 ? 'text-green-600' : 
                        calculateTrustScore(selectedArticle) >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>{calculateTrustScore(selectedArticle)}%</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Net Votes</p>
                      <p className="font-semibold text-2xl text-blue-600">
                        {(selectedArticle.votes || 0) - (selectedArticle.downvotes || 0)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsChatOpen(true);
                      setChatInput(`Tell me more about: ${selectedArticle.title}`);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Ask AI About This
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm">Click any article to see AI analysis</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat Assistant */}
      <div className="fixed bottom-4 right-4 z-50">
        {isChatOpen ? (
          <div className="bg-white rounded-lg shadow-2xl w-96 h-[500px] flex flex-col border-2 border-indigo-500">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-t-lg flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                <span className="font-semibold">AI News Assistant</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/20 rounded p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 text-indigo-400" />
                  <p className="text-sm">Ask me anything about the news!</p>
                  <p className="text-xs mt-2 text-gray-400">Powered by Groq LLaMA 3.1</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}>
                      <p className="text-sm whitespace-pre-line">{msg.content}</p>
                      {msg.articles && msg.articles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.articles.map(article => (
                            <div 
                              key={article.id} 
                              onClick={() => selectArticle(article)}
                              className="text-xs bg-indigo-50 text-indigo-800 p-2 rounded cursor-pointer hover:bg-indigo-100"
                            >
                              <div className="font-semibold">{article.title}</div>
                              <div className="text-indigo-600">Trust: {article.trustScore}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <Sparkles className="w-5 h-5 text-indigo-600 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t bg-white rounded-b-lg">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isChatLoading && sendChatMessage()}
                  placeholder="Ask about news..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={isChatLoading}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={isChatLoading || !chatInput.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsChatOpen(true)}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 group"
          >
            <MessageCircle className="w-6 h-6" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap">
              Ask AI
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default BlockchainNewsApp;