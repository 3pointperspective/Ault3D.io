// Lightbox for project images: click to open, arrows / swipe to move, Esc to close.
(() => {
  const links = [...document.querySelectorAll("a[data-lightbox]")];
  if (!links.length) return;
  const box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.innerHTML = '<img alt=""><button class="lb-close" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous">‹</button><button class="lb-next" aria-label="Next">›</button><div class="lb-cap"></div><div class="lb-count"></div>';
  document.body.appendChild(box);
  const img = box.querySelector("img");
  const count = box.querySelector(".lb-count");
  const cap = box.querySelector(".lb-cap");
  let i = 0;
  const show = (n) => {
    i = (n + links.length) % links.length;
    img.src = links[i].href;
    count.textContent = `${i + 1} / ${links.length}`;
    cap.textContent = links[i].dataset.caption || "";
  };
  const open = (n) => { show(n); box.classList.add("open"); document.body.style.overflow = "hidden"; };
  const close = () => { box.classList.remove("open"); document.body.style.overflow = ""; img.removeAttribute("src"); };
  links.forEach((a, n) => a.addEventListener("click", (e) => { e.preventDefault(); open(n); }));
  box.querySelector(".lb-close").onclick = close;
  box.querySelector(".lb-prev").onclick = (e) => { e.stopPropagation(); show(i - 1); };
  box.querySelector(".lb-next").onclick = (e) => { e.stopPropagation(); show(i + 1); };
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  document.addEventListener("keydown", (e) => {
    if (!box.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(i - 1);
    if (e.key === "ArrowRight") show(i + 1);
  });
  let x0 = null;
  box.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();
