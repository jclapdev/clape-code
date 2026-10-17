// Runs before the app paints so the chosen theme doesn't flash. next-themes stores the same key.
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("cc-theme") || "system";
  } catch (e) {}
  var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
