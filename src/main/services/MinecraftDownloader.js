const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

class MinecraftDownloader {
  constructor(configManager) {
    this.configManager = configManager;
    this.versionsManifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
    this.cachedVersions = null;
    this.cacheExpiration = null;
  }
  
  async getAvailableVersions() {
    // Check if cache is still valid (1 hour)
    const now = Date.now();
    if (!this.cachedVersions || !this.cacheExpiration || now > this.cacheExpiration) {
      try {
        const response = await fetch(this.versionsManifestUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch versions: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Format versions for UI
        this.cachedVersions = data.versions
          .filter(v => !v.id.includes('pre') && !v.id.includes('rc'))
          .map(v => ({
            id: v.id,
            type: v.type,
            url: v.url,
            releaseTime: v.releaseTime
          }))
          .sort((a, b) => new Date(b.releaseTime) - new Date(a.releaseTime));
        
        // Cache for 1 hour
        this.cacheExpiration = now + (60 * 60 * 1000);
      } catch (error) {
        console.error('Error fetching Minecraft versions:', error);
        return [];
      }
    }
    
    return this.cachedVersions;
  }
  
  async getRecommendedVersion() {
    const versions = await this.getAvailableVersions();
    // Return the latest release
    return versions.find(v => v.type === 'release') || null;
  }
  
  async downloadServer(versionId, destinationDir, progressCallback = null) {
    // Get version details from manifest
    const versions = await this.getAvailableVersions();
    const version = versions.find(v => v.id === versionId);
    
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    // Create the directory if it doesn't exist
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    
    const serverJarPath = path.join(destinationDir, 'server.jar');
    
    // Get download URL from version details
    const versionDetailsResponse = await fetch(version.url);
    const versionDetails = await versionDetailsResponse.json();
    
    if (!versionDetails.downloads || !versionDetails.downloads.server) {
      throw new Error(`No server download available for version ${versionId}`);
    }
    
    const downloadUrl = versionDetails.downloads.server.url;
    const fileSize = versionDetails.downloads.server.size;
    
    // Download the server jar
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }
    
    const fileStream = fs.createWriteStream(serverJarPath);
    let downloaded = 0;
    
    // Report initial progress
    if (progressCallback) {
      progressCallback({
        percentage: 0,
        downloaded: 0,
        total: fileSize
      });
    }
    
    response.body.on('data', (chunk) => {
      downloaded += chunk.length;
      
      // Report download progress at reasonable intervals
      if (progressCallback && fileSize) {
        const percentage = Math.round((downloaded / fileSize) * 100);
        progressCallback({
          percentage,
          downloaded,
          total: fileSize
        });
      }
    });
    
    await streamPipeline(response.body, fileStream);
    
    // Report completion
    if (progressCallback) {
      progressCallback({
        percentage: 100,
        downloaded: fileSize,
        total: fileSize
      });
    }
    
    return serverJarPath;
  }
}

module.exports = MinecraftDownloader;