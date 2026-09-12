(function () {
  var games = (window.HeroArcade && window.HeroArcade.games) || [];
  var grid = document.getElementById("gameGrid");
  var emptyNote = document.getElementById("emptyNote");

  if (games.length === 0) {
    emptyNote.hidden = false;
    return;
  }

  games.forEach(function (game) {
    var card = document.createElement("a");
    card.className = "game-card";
    card.href = "games/" + game.slug + "/";
    card.style.borderColor = game.accent + "55";

    var emoji = document.createElement("span");
    emoji.className = "game-card__emoji";
    emoji.textContent = game.emoji;

    var title = document.createElement("p");
    title.className = "game-card__title";
    title.textContent = game.title;

    var tagline = document.createElement("p");
    tagline.className = "game-card__tagline";
    tagline.textContent = game.tagline;

    card.appendChild(emoji);
    card.appendChild(title);
    card.appendChild(tagline);
    grid.appendChild(card);
  });
})();
