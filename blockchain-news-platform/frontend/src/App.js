import React, { useState, useEffect } from 'react';
import { Search, Upload, ThumbsUp, ThumbsDown, ExternalLink, Database, Sparkles, BookOpen, TrendingUp, Zap, Globe, Users, Clock, Award } from 'lucide-react';

const API_URL = 'http://localhost:3001/api';

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
  const [articleAnalysis, setArticleAnalysis] = useState(null);
  const [analyzingArticle, setAnalyzingArticle] = useState(false);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [topNews, setTopNews] = useState([]);

  useEffect(() => {
    loadInitialData();
    const interval = setInterval(loadNodeStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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
        const scoreA = calculateTrustScore(a) + (a.votes || 0) * 2;
        const scoreB = calculateTrustScore(b) + (b.votes || 0) * 2;
        return scoreB - scoreA;
      })
      .slice(0, 3);
    setTopNews(sorted);
  };

  const calculateTrustScore = (article) => {
    let score = 50;
    if (article.url?.includes('https')) score += 10;
    if (article.content?.length > 200) score += 10;
    if (article.votes && article.votes > 0) score += Math.min(article.votes * 2, 20);
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
      alert('Please fill in the title field');
      return;
    }

    if (!walletConnected) {
      alert('Please connect your wallet first');
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
        alert('Article added to blockchain!');
        setNewArticle({ title: '', url: '', content: '' });
        await loadArticles();
        setActiveTab('feed');
      } else {
        alert('Failed to add article');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload article');
    }
  };

  const voteArticle = async (articleId) => {
    if (!walletConnected) {
      alert('Please connect your wallet to vote');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/articles/${articleId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (data.success) {
        await loadArticles();
      }
    } catch (error) {
      console.error('Vote error:', error);
    }
  };

  const analyzeArticle = async (article) => {
    setSelectedArticle(article);
    setAnalyzingArticle(true);
    setArticleAnalysis(null);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const summary = generateSummary(article.content || article.title);
    const keyPoints = extractKeyPoints(article.content || article.title);
    
    setArticleAnalysis({
      summary,
      keyPoints,
      sentiment: 'Informative',
      readability: calculateTrustScore(article),
      trustScore: calculateTrustScore(article),
      votes: article.votes || 0,
      peerVerifications: article.peerVerifications || 0
    });
    
    setAnalyzingArticle(false);
  };

  const generateSummary = (text) => {
    if (!text) return 'No content available for summarization.';
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, 2).join(' ').substring(0, 200) + '...';
  };

  const extractKeyPoints = (text) => {
    if (!text) return ['Content analysis not available'];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, 3).map(s => s.trim());
  };

  const searchArticles = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    
    try {
      const response = await fetch(`${API_URL}/search?query=${encodeURIComponent(searchQuery)}&limit=10`);
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
      setSelectedArticle(null);
      setArticleAnalysis(null);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <Database className="w-8 h-8 text-indigo-600" />
                DecentraNews AI
              </h1>
              <p className="text-gray-600 mt-1">RAG-Powered Blockchain News Curation</p>
            </div>
            <button
              onClick={connectWallet}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                walletConnected
                  ? 'bg-green-500 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {walletConnected ? `Connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connect Wallet'}
            </button>
          </div>

          {/* Node Status */}
          {nodeStatus && (
            <div className="flex items-center gap-6 text-sm bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${nodeStatus.status === 'healthy' ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-gray-700">Node: {nodeStatus.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">{nodeStatus.peers} peers</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">Block #{nodeStatus.chainLength}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg mb-6">
          <div className="flex border-b overflow-x-auto">
            <button
              onClick={() => setActiveTab('feed')}
              className={`flex-1 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                activeTab === 'feed'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <TrendingUp className="w-5 h-5 inline mr-2" />
              Top News
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                activeTab === 'search'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Search className="w-5 h-5 inline mr-2" />
              AI Search
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                activeTab === 'upload'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Upload className="w-5 h-5 inline mr-2" />
              Upload
            </button>
            <button
              onClick={() => setActiveTab('browse')}
              className={`flex-1 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                activeTab === 'browse'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <BookOpen className="w-5 h-5 inline mr-2" />
              All Articles
            </button>
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
                  <p className="text-gray-600">Highest rated articles based on trust score and community votes</p>
                </div>

                {topNews.length > 0 ? (
                  <div className="space-y-6">
                    {topNews.map((article, index) => (
                      <div 
                        key={article.id}
                        className="bg-gradient-to-r from-white to-gray-50 rounded-xl p-6 border-2 border-indigo-200 shadow-lg hover:shadow-xl transition-all"
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
                                Trust Score: {calculateTrustScore(article)}%
                              </div>
                              <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                <ThumbsUp className="w-4 h-4" />
                                {article.votes || 0} votes
                              </div>
                              <div className="flex items-center gap-2 bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">
                                <Users className="w-4 h-4" />
                                {article.peerVerifications || 0} verifications
                              </div>
                              <div className="flex items-center gap-2 bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                                <Clock className="w-4 h-4" />
                                {new Date(article.timestamp).toLocaleDateString()}
                              </div>
                            </div>

                            {article.content && (
                              <p className="text-gray-700 mb-4 line-clamp-2">
                                {article.content.substring(0, 200)}...
                              </p>
                            )}

                            <div className="flex gap-3">
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                                onClick={(e) => {
                                  if (article.url.startsWith('#')) {
                                    e.preventDefault();
                                  }
                                }}
                              >
                                {article.url.startsWith('#') ? 'Original Content' : 'Read Full Article'} <ExternalLink className="w-4 h-4" />
                              </a>
                              <button
                                onClick={() => analyzeArticle(article)}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
                              >
                                <Sparkles className="w-4 h-4" />
                                AI Analysis
                              </button>
                              <button
                                onClick={() => voteArticle(article.id)}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all"
                                disabled={!walletConnected}
                              >
                                <ThumbsUp className="w-4 h-4" />
                                Vote
                              </button>
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

            {/* Search Tab with RAG */}
            {activeTab === 'search' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
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
                        Found {searchResults.length} articles
                      </h3>
                      {searchResults.map(article => (
                        <div 
                          key={article.id} 
                          className={`bg-gray-50 rounded-lg p-5 border-2 transition-all cursor-pointer ${
                            selectedArticle?.id === article.id 
                              ? 'border-indigo-500 shadow-md' 
                              : 'border-gray-200 hover:border-indigo-300'
                          }`}
                          onClick={() => analyzeArticle(article)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="text-xl font-semibold text-gray-800 mb-2">{article.title}</h4>
                              <div className="flex gap-3 text-sm text-gray-600 mb-3">
                                <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
                                  Trust: {article.trustScore}%
                                </span>
                                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
                                  Relevance: {article.relevance.toFixed(1)}%
                                </span>
                                {article.votes > 0 && (
                                  <span>Votes: {article.votes}</span>
                                )}
                              </div>
                              {article.summary && (
                                <p className="text-gray-700 text-sm mb-3">{article.summary}</p>
                              )}
                              <div className="flex items-center gap-4">
                                <a
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (article.url.startsWith('#')) {
                                      e.preventDefault();
                                    }
                                  }}
                                >
                                  {article.url.startsWith('#') ? 'Original Content' : 'Read Full Article'} <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    voteArticle(article.id);
                                  }}
                                  className="text-green-600 hover:text-green-800 flex items-center gap-1"
                                  disabled={!walletConnected}
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                  Vote
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchQuery && !isSearching ? (
                    <div className="text-center py-12 text-gray-500">
                      No articles found. Try a different search term.
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p>Search for news articles to get AI-powered summaries</p>
                    </div>
                  )}
                </div>

                {/* RAG Analysis Panel */}
                <div className="lg:col-span-1">
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200 sticky top-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-6 h-6 text-purple-600" />
                      <h3 className="text-xl font-bold text-gray-800">AI Analysis</h3>
                    </div>

                    {analyzingArticle ? (
                      <div className="text-center py-8">
                        <Sparkles className="w-12 h-12 mx-auto text-purple-600 animate-spin mb-4" />
                        <p className="text-gray-600">Analyzing article with RAG...</p>
                      </div>
                    ) : selectedArticle && articleAnalysis ? (
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-500" />
                            Quick Summary
                          </h4>
                          <p className="text-gray-700 text-sm leading-relaxed bg-white p-3 rounded-lg">
                            {articleAnalysis.summary}
                          </p>
                        </div>

                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2">Key Points</h4>
                          <ul className="space-y-2">
                            {articleAnalysis.keyPoints.map((point, idx) => (
                              <li key={idx} className="text-sm text-gray-700 flex items-start gap-2 bg-white p-2 rounded">
                                <span className="text-indigo-600 font-bold">•</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-600 mb-1">Trust Score</p>
                            <p className={`font-semibold ${
                              articleAnalysis.trustScore >= 70 ? 'text-green-600' : 
                              articleAnalysis.trustScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                            }`}>{articleAnalysis.trustScore}%</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-600 mb-1">Votes</p>
                            <p className="font-semibold text-gray-800">{articleAnalysis.votes}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">Select an article to see AI analysis</p>
                      </div>
                    )}
                  </div>
                </div>
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
                      placeholder="https://example.com/article (optional)"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty if posting original content</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Content/Summary</label>
                    <textarea
                      value={newArticle.content}
                      onChange={(e) => setNewArticle({ ...newArticle, content: e.target.value })}
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-32"
                      placeholder="Article summary or full content..."
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

            {/* Browse All Articles */}
            {activeTab === 'browse' && (
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  All Articles ({articles.length})
                </h3>
                {articles.length > 0 ? (
                  <div className="space-y-4">
                    {articles.map(article => (
                      <div key={article.id} className="bg-gray-50 rounded-lg p-5 border border-gray-200 hover:shadow-md transition-all">
                        <h4 className="text-xl font-semibold text-gray-800 mb-2">{article.title}</h4>
                        <div className="flex gap-3 text-sm text-gray-600 mb-3 flex-wrap">
                          <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
                            Trust: {calculateTrustScore(article)}%
                          </span>
                          <span>Votes: {article.votes || 0}</span>
                          <span>Block #{article.blockHeight}</span>
                        </div>
                        <div className="flex gap-3">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            onClick={(e) => {
                              if (article.url.startsWith('#')) {
                                e.preventDefault();
                              }
                            }}
                          >
                            {article.url.startsWith('#') ? 'Original Content' : 'Read Article'} <ExternalLink className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => {
                              analyzeArticle(article);
                              setActiveTab('search');
                            }}
                            className="text-purple-600 hover:text-purple-800 flex items-center gap-1"
                          >
                            <Sparkles className="w-4 h-4" />
                            Analyze
                          </button>
                          <button
                            onClick={() => voteArticle(article.id)}
                            className="text-green-600 hover:text-green-800 flex items-center gap-1"
                            disabled={!walletConnected}
                          >
                            <ThumbsUp className="w-4 h-4" />
                            Vote
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p>No articles in the blockchain yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-indigo-600">{articles.length}</div>
            <div className="text-gray-600 mt-1">Total Articles</div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {nodeStatus ? nodeStatus.chainLength : 0}
            </div>
            <div className="text-gray-600 mt-1">Blockchain Blocks</div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {nodeStatus ? nodeStatus.peers : 0}
            </div>
            <div className="text-gray-600 mt-1">Network Peers</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockchainNewsApp;