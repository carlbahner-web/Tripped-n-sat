fetch("media/candidates/manifest.json")
  .then((res) => res.json())
  .then((items) => {
    const grid = document.getElementById("candidate-grid");
    items.forEach(({ file, label }) => {
      const card = document.createElement("figure");
      card.className = "candidate-card";

      const img = document.createElement("img");
      img.src = `media/candidates/${file}`;
      img.alt = label;

      const caption = document.createElement("figcaption");
      caption.textContent = label;

      card.appendChild(img);
      card.appendChild(caption);
      grid.appendChild(card);
    });
  })
  .catch((err) => console.warn("Could not load candidate assets manifest", err));
