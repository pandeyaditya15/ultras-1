"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UltrasAI() {
  const router = useRouter();
  const [selectedTopic, setSelectedTopic] = useState(null);

  // Demo AI-generated trending topics for Manchester City
  const trendingTopics = [
    {
      id: 1,
      title: "Haaland&apos;s Golden Boot Race",
      description: "Erling Haaland&apos;s pursuit of Premier League scoring records and his impact on City&apos;s title chase",
      engagement: "🔥 2.4M mentions",
      sentiment: "positive",
      category: "Player Performance"
    },
    {
      id: 2,
      title: "De Bruyne&apos;s Return from Injury",
      description: "Kevin De Bruyne&apos;s comeback and his crucial role in City&apos;s midfield creativity",
      engagement: "🔥 1.8M mentions",
      sentiment: "positive",
      category: "Injury Updates"
    },
    {
      id: 3,
      title: "Pep&apos;s Tactical Evolution",
      description: "Guardiola&apos;s latest tactical innovations and formation changes this season",
      engagement: "🔥 1.5M mentions",
      sentiment: "neutral",
      category: "Tactics"
    },
    {
      id: 4,
      title: "Champions League Quarter-Final Draw",
      description: "City&apos;s potential opponents and path to Champions League glory",
      engagement: "🔥 1.2M mentions",
      sentiment: "excited",
      category: "Competitions"
    },
    {
      id: 5,
      title: "Foden&apos;s Breakthrough Season",
      description: "Phil Foden&apos;s emergence as a key player and his England prospects",
      engagement: "🔥 980K mentions",
      sentiment: "positive",
      category: "Player Development"
    },
    {
      id: 6,
      title: "Transfer Window Speculations",
      description: "Rumors about potential signings and departures at the Etihad",
      engagement: "🔥 850K mentions",
      sentiment: "curious",
      category: "Transfers"
    },
    {
      id: 7,
      title: "Premier League Title Race",
      description: "City&apos;s position in the title race and remaining fixtures analysis",
      engagement: "🔥 750K mentions",
      sentiment: "nervous",
      category: "League"
    },
    {
      id: 8,
      title: "Stadium Expansion Plans",
      description: "Latest updates on Etihad Stadium expansion and infrastructure projects",
      engagement: "🔥 620K mentions",
      sentiment: "positive",
      category: "Infrastructure"
    },
    {
      id: 9,
      title: "Academy Prospects",
      description: "Rising stars from City&apos;s youth academy and their first-team chances",
      engagement: "🔥 540K mentions",
      sentiment: "excited",
      category: "Youth"
    },
    {
      id: 10,
      title: "Derby Day Preparations",
      description: "Build-up to the next Manchester derby and historical rivalry context",
      engagement: "🔥 480K mentions",
      sentiment: "intense",
      category: "Rivalry"
    }
  ];

  console.log('UltrasAI component rendering, trendingTopics length:', trendingTopics.length);

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'positive': return 'text-green-400';
      case 'negative': return 'text-red-400';
      case 'excited': return 'text-yellow-400';
      case 'nervous': return 'text-orange-400';
      case 'intense': return 'text-purple-400';
      case 'curious': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      case 'excited': return '🤩';
      case 'nervous': return '😰';
      case 'intense': return '💪';
      case 'curious': return '🤔';
      default: return '😐';
    }
  };

  const handleCreateRoom = (topic) => {
    // Navigate to host page with topic pre-filled
    router.push(`/host?topic=${encodeURIComponent(topic.title)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1b2838] to-[#2a475e] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Debug info */}
        <div className="text-white text-center mb-4">
          Ultras AI Page Loading - Topics: {trendingTopics.length}
        </div>
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-[#66c0f4]">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <h1 className="text-5xl font-bold text-white">Ultras AI</h1>
          </div>
          <p className="text-xl text-[#c7d5e0] mb-2">AI-Powered Trending Topics for Manchester City</p>
          <p className="text-[#8f98a0]">Discover what&apos;s buzzing in the City universe and start engaging conversations</p>
        </div>

        {/* Stats Bar */}
        <div className="bg-[#2a475e] rounded-xl p-6 mb-8 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-[#66c0f4]">10</div>
              <div className="text-[#8f98a0]">Trending Topics</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">12.2M</div>
              <div className="text-[#8f98a0]">Total Mentions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">85%</div>
              <div className="text-[#8f98a0]">Positive Sentiment</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">24h</div>
              <div className="text-[#8f98a0]">Update Frequency</div>
            </div>
          </div>
        </div>

        {/* Topics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trendingTopics.map((topic, index) => (
            <div 
              key={topic.id}
              className="bg-[#2a475e] rounded-xl p-6 border border-gray-700 hover:border-[#66c0f4] transition-all duration-300 hover:shadow-lg hover:shadow-[#66c0f4]/20 cursor-pointer group"
              onClick={() => setSelectedTopic(topic)}
            >
              {/* Rank Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#66c0f4] rounded-full flex items-center justify-center text-white font-bold text-sm">
                    #{index + 1}
                  </div>
                  <span className="text-xs bg-[#1b2838] text-[#8f98a0] px-2 py-1 rounded-full">
                    {topic.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${getSentimentColor(topic.sentiment)}`}>
                    {getSentimentIcon(topic.sentiment)}
                  </span>
                </div>
              </div>

              {/* Topic Title */}
              <h3 className="text-lg font-bold text-white mb-3 group-hover:text-[#66c0f4] transition-colors">
                {topic.title}
              </h3>

              {/* Description */}
              <p className="text-[#c7d5e0] text-sm mb-4 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {topic.description}
              </p>

              {/* Engagement */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8f98a0]">
                  {topic.engagement}
                </span>
                <button 
                  onClick={(e) => { e.stopPropagation(); }}
                  className="bg-[#66c0f4] hover:bg-[#4f94bc] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Generate Script
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Selected Topic Modal */}
        {selectedTopic && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-[#2a475e] rounded-xl p-8 max-w-2xl w-full border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedTopic.title}</h2>
                <button 
                  onClick={() => setSelectedTopic(null)}
                  className="text-[#8f98a0] hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm bg-[#1b2838] text-[#8f98a0] px-3 py-1 rounded-full">
                    {selectedTopic.category}
                  </span>
                  <span className={`text-lg ${getSentimentColor(selectedTopic.sentiment)}`}>
                    {getSentimentIcon(selectedTopic.sentiment)} {selectedTopic.sentiment}
                  </span>
                </div>
                
                <p className="text-[#c7d5e0] text-lg leading-relaxed">
                  {selectedTopic.description}
                </p>
                
                <div className="bg-[#1b2838] rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-2">AI Insights:</h4>
                  <ul className="text-[#c7d5e0] text-sm space-y-1">
                    <li>• High engagement potential for live discussions</li>
                    <li>• Perfect timing for community reaction</li>
                    <li>• Multiple angles for conversation flow</li>
                    <li>• Strong emotional connection with fans</li>
                  </ul>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => handleCreateRoom(selectedTopic)}
                    className="flex-1 bg-[#66c0f4] hover:bg-[#4f94bc] text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    Start Room About This Topic
                  </button>
                  <button 
                    onClick={() => setSelectedTopic(null)}
                    className="px-6 py-3 border border-gray-600 text-[#c7d5e0] rounded-lg hover:bg-[#1b2838] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-[#8f98a0]">
          <p className="text-sm">
            Powered by AI • Updated every 24 hours • 
            <span className="text-[#66c0f4] ml-1">Coming Soon: Real-time data integration</span>
          </p>
        </div>
      </div>
    </div>
  );
} 