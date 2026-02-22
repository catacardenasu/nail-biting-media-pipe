self.addEventListener('message', (event) => {
  if (event.data?.type === 'BITE_ALERT') {
    self.registration.showNotification('Niblet Monitor', {
      body: 'Stop biting your nails!',
      tag: 'niblet-alert',
      renotify: true,
      requireInteraction: true,
    });
  }
});