import('./p5Sketch.js').catch(error => {
  document.querySelector('[role=alert]').textContent = `Could not start p5: ${error.message}`;
  console.error(error);
});
