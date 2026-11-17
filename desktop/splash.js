window.momoStartup?.onStatus((message) => {
  document.getElementById("startup-status").textContent = message;
});
document.getElementById("cancel").addEventListener("click", (event) => {
  event.currentTarget.disabled = true;
  document.getElementById("startup-status").textContent =
    "Closing your office…";
  window.momoStartup?.cancel();
});
