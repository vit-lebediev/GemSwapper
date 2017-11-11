import math.geom.Point as Point;

import animate;

import ui.ParticleEngine as ParticleEngine;

import ui.ImageView as ImageView;

import src.managers.LevelManager as LevelManager;
import src.LevelGrid as LevelGrid;
import src.models.gem.Gem as Gem;

const SWAP_FORBIDDEN_ANIMATION_DURATION = 50;
const SWAP_CLUE_ANIMATION_DURATION = 600;

exports = Class(ImageView, function(supr) {

  this.init = function(opts) {

    this._levelManager = null;
    this.level = null;
    this._dragStarted = false;
    this._userInteractionStopped = false;
    this._dragStartCoords = null;

    this._initialClueTimer = null;
    this._clueTimer = null;
    this._clueSwapGems = null;

    this.width = opts.width;
    this.height = opts.height;

    opts = merge(opts, {
      image: 'resources/images/ui/background.png'
    });

    supr(this, 'init', [opts]);

    this._build();
  };

  this._build = function() {

    this._pEngine = new ParticleEngine({
      superview: this,
      width: 1,
      height: 1,
      initCount: 100
    });

    // init level manager
    this._levelManager = new LevelManager({
      container: this
    });

    // init first level
    this._level = this._levelManager.initLevel();

    this._fireUpClueAnimation();

    // TODO init scores manager

    this.on('InputStart', bind(this, function(event, point) {

      console.log('Input started!');

      this._dragStarted = true;
      this._dragStartCoords = point;
      this._origGem = this._level.getGemByCoords(point);
    }));

    this.on('InputMove', bind(this, function(event, point) {

      if (!this._dragStarted || this._userInteractionStopped) return;

      console.log('Input moved!!');

      var delta = { x: point.x - this._dragStartCoords.x, y: point.y - this._dragStartCoords.y };

      if (this._movedFarEnough(delta)) {

        // get drag direction
        var direction = this._getDragDirection(delta);

        if (this._level.gemPresentToDirection(this._origGem, direction)) {

          this._userInteractionStopped = true;

          var targetGem = this._level.getTargetGem(this._origGem, direction);

          if (this._level.swapPossibleFor(this._origGem, targetGem)) {

            console.log(`direction is ${ direction }, delta is x: ${ delta.x }, y: ${ delta.y }`);

            this._clearClue();

            this._level.swapGems(this._origGem, targetGem);
          } else {

            // play animation, and don't move gems
            var origGemCoords = new Point(this._origGem.style.x, this._origGem.style.y);
            var targetGemCoords = new Point(targetGem.style.x, targetGem.style.y);

            animate(this._origGem)
                .now({ x: origGemCoords.x - 2, y: origGemCoords.y - 2}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then({ x: origGemCoords.x + 2, y: origGemCoords.y + 2}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then({ x: origGemCoords.x - 2, y: origGemCoords.y - 2}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then({ x: origGemCoords.x, y: origGemCoords.y}, SWAP_FORBIDDEN_ANIMATION_DURATION);

            animate(targetGem)
                .now({ x: targetGemCoords.x - 2, y: targetGemCoords.y - 2}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then({ x: targetGemCoords.x + 2, y: targetGemCoords.y + 2}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then({ x: targetGemCoords.x - 2, y: targetGemCoords.y - 2}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then({ x: targetGemCoords.x, y: targetGemCoords.y}, SWAP_FORBIDDEN_ANIMATION_DURATION)
                .then(bind(this, function() {

                  if (!this._dragStarted) {

                    this._userInteractionStopped = false;
                  }
                }));
          }
        }
      }
    }));

    this.on('InputSelect', bind(this, function(event, point) {

      console.log('Input ended!!!');

      this._dragStarted = false;
      this._userInteractionStopped = false;
    }));

    this._level.on('GemSwapComplete', bind(this, function() {

      this._level.deleteSequences({
        horizSequences: this._level.detectHorizontalSequences(),
        vertSequences: this._level.detectVerticalSequences()
      });
    }));

    this._level.on('GemDestroyed', bind(this, function(gem) {

      console.log('ON GEM DESTROYED');

      let particleObjects = this._pEngine.obtainParticleArray(10);

      for (let i = 0; i < 10; i++) {

        let pObj = particleObjects[i];

        pObj.x = gem.style.x;
        pObj.y = gem.style.y;

        pObj.dx = Math.random() * -100;
        pObj.dy = Math.random() * -100;
        pObj.ttl = 500;
        pObj.ddy = 50;
        pObj.width = 50;
        pObj.height = 50;
        pObj.zIndex = 1000;
        pObj.image = `resources/images/particles/gleam_${ gem.color }.png`;
      }

      this._pEngine.emitParticles(particleObjects);

      this._level.releaseGem(gem);
    }));

    this._level.on('DeleteSequencesComplete', bind(this, function() {

      this._level.detectGapsAndMoveUpperGems();
    }));

    this._level.on('GapsDetectionComplete', bind(this, function() {

      this._level.spawnNewGems();
    }));

    this._level.on('GemSpawnComplete', bind(this, function() {

      if (this._level.hasDeletableSequences()) {

        this._level.deleteSequences({
          horizSequences: this._level.detectHorizontalSequences(),
          vertSequences: this._level.detectVerticalSequences()
        });
      } else {

        this._userInteractionStopped = false;

        if (this._initialClueTimer === null && this._clueTimer === null) {

          this._fireUpClueAnimation();
        }
      }
    }));
  };

  this.tick = function(dt) {

    this._pEngine.runTick(dt);
  };

  this._getDragDirection = function(dragDelta) {

    if (Math.abs(dragDelta.x) >= Math.abs(dragDelta.y)) {
      // horizontal drag
      if (dragDelta.x > 0) return LevelGrid.DIRECTION_RIGHT;
      else return LevelGrid.DIRECTION_LEFT;
    } else {
      // vertical drag
      if (dragDelta.y > 0) return LevelGrid.DIRECTION_DOWN;
      else return LevelGrid.DIRECTION_UP;
    }
  };

  this._movedFarEnough = function(delta) {

    return Math.abs(delta.x) >= Gem.GEM_WIDTH / 2 || Math.abs(delta.y) >= Gem.GEM_HEIGHT / 2;
  };

  this._fireUpClueAnimation = function() {

    // start timer for a clue on swapping gems
    this._initialClueTimer = setTimeout(bind(this, function() {

      this._clueTimer = setInterval(bind(this, this._animateClue), SWAP_CLUE_ANIMATION_DURATION + 200);
    }), 3000);
  };

  this._animateClue = function() {

    if (this._clueSwapGems === null) {
      this._clueSwapGems = this._level.getRandomPossibleSwap();
    }

    const [gem1, gem2] = this._clueSwapGems;

    // play animation, and don't move gems
    const gem1Coords = new Point(gem1.style.x, gem1.style.y);
    const gem2Coords = new Point(gem2.style.x, gem2.style.y);

    if (gem1.getGridPosition().col !== gem2.getGridPosition().col) {

      // horizontal swap
      animate(gem1)
          .now({ x: gem1Coords.x - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ x: gem1Coords.x + 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ x: gem1Coords.x - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ x: gem1Coords.x }, SWAP_CLUE_ANIMATION_DURATION / 4);

      animate(gem2)
          .now({ x: gem2Coords.x - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ x: gem2Coords.x + 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ x: gem2Coords.x - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ x: gem2Coords.x }, SWAP_CLUE_ANIMATION_DURATION / 4);
    } else {

      // vertical swap
      animate(gem1)
          .now({ y: gem1Coords.y - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ y: gem1Coords.y + 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ y: gem1Coords.y - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ y: gem1Coords.y }, SWAP_CLUE_ANIMATION_DURATION / 4);

      animate(gem2)
          .now({ y: gem2Coords.y - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ y: gem2Coords.y + 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ y: gem2Coords.y - 2 }, SWAP_CLUE_ANIMATION_DURATION / 4)
          .then({ y: gem2Coords.y }, SWAP_CLUE_ANIMATION_DURATION / 4);
    }
  };

  this._clearClue = function() {

    clearInterval(this._initialClueTimer);
    clearInterval(this._clueTimer);

    this._initialClueTimer = null;
    this._clueTimer = null;
    this._clueSwapGems = null;
  }
});
