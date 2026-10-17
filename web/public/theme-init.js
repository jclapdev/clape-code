// Runs before the app paints so a dark-mode choice doesn't flash light first.
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("cc-theme") || "system";
  } catch (e) {}
  if (pref === "light" || pref === "dark") document.documentElement.setAttribute("data-theme", pref);
})();
