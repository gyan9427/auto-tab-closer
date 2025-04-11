(function () {
    if (window.toastExists) return; // Prevent duplication
    window.toastExists = true;
  
    const toast = document.createElement("div");
    toast.innerHTML = `
      <div class="auto-tab-toast">
        Set tab timeout (mins): 
        <input type="number" id="timeoutInput" min="1" placeholder="Default 20">
      </div>
    `;
    document.body.appendChild(toast);
  
    setTimeout(() => {
      toast.remove();
      window.toastExists = false;
    }, 5000);
  
    document.getElementById("timeoutInput").addEventListener("change", (e) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value > 0) {
        chrome.runtime.sendMessage({ type: "setTimeout", timeout: value });
      }
    });
  })();
  