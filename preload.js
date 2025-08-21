const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
    saveFile: (filePath, buffer) => ipcRenderer.invoke('save-file', filePath, buffer),
    quickSave: (buffer, notes) => ipcRenderer.invoke('quick-save', buffer, notes),
    deleteOriginalVideo: () => ipcRenderer.invoke('delete-original-video'),
    openGallery: (customPath) => ipcRenderer.invoke('open-gallery', customPath),
    selectGalleryDirectory: () => ipcRenderer.invoke('select-gallery-directory'),
    readImageAsBase64: (imagePath) => ipcRenderer.invoke('read-image-as-base64', imagePath),
    saveCropArea: (cropArea) => ipcRenderer.invoke('save-crop-area', cropArea),
    loadCropArea: () => ipcRenderer.invoke('load-crop-area'),
    onWindowResized: (callback) => ipcRenderer.on('window-resized', callback)
});