import panzoom from '../lib/panzoom';
import { clamp } from '../lib/mumath/index';

import Base from '../core/Base';
import { MAP, Modes } from '../core/Constants';
import Grid from '../grid/Grid';
import { Point } from '../geometry/Point';
import ModesMixin from './ModesMixin';
import { mix } from '../lib/mix';

export class Map extends mix(Base).with(ModesMixin) {
  constructor(container, options) {
    super(options);

    this.defaults = Object.assign({}, MAP);

    // set defaults
    Object.assign(this, this.defaults);

    // overwrite options
    Object.assign(this, this._options);

    this.center = new Point(this.center);

    this.container = container || document.body;

    const canvas = document.createElement('canvas');
    this.container.appendChild(canvas);
    canvas.setAttribute('id', 'indoors-map-canvas');

    canvas.width = this.width || this.container.clientWidth;
    canvas.height = this.height || this.container.clientHeight;

    this.canvas = new fabric.Canvas(canvas, {
      preserveObjectStacking: true
    });
    this.context = this.canvas.getContext('2d');

    this.on('render', () => {
      if (this.autostart) this.clear();
    });

    this.originX = -this.canvas.width / 2 + this._options.center.x;
    this.originY = -this.canvas.height / 2 + this._options.center.y;

    this.canvas.absolutePan({
      x: this.originX,
      y: this.originY
    });

    try {
      this.addFloorPlan();
    } catch (e) {
      console.error(e);
    }
    this.addGrid();

    this.setMode(this.mode || Modes.GRAB);

    const vm = this;
    panzoom(this.container, e => {
      vm.panzoom(e);
    });

    this.registerListeners();

    setTimeout(() => {
      this.emit('ready', this);
    }, 300);
  }

  addFloorPlan() {
    if (!this.floorplan) return;
    const vm = this;
    this.floorplan.on('load', img => {
      vm.addLayer(img);
    });
  }

  addLayer(layer) {
    this.canvas.add(layer.shape);
    this.canvas._objects.sort((o1, o2) => o1.zIndex - o2.zIndex);

    if (layer.shape.keepOnZoom) {
      layer.shape._set('scaleX', 1 / this.zoom);
      layer.shape._set('scaleY', 1 / this.zoom);
      this.emit(`${layer.class}scaling`, layer);
    }
    // this.update();
    // this.canvas.renderAll();
  }

  removeLayer(layer) {
    this.canvas.remove(layer.shape);
  }

  addGrid() {
    this.gridCanvas = this.cloneCanvas();
    this.gridCanvas.setAttribute('id', 'indoors-grid-canvas');
    this.grid = new Grid(this.gridCanvas, this);
    this.grid.draw();
  }

  moveTo(obj, index) {
    if (index !== undefined) {
      obj.zIndex = index;
    }
    this.canvas.moveTo(obj.shape, obj.zIndex);
  }

  cloneCanvas(canvas) {
    canvas = canvas || this.canvas;
    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    canvas.wrapperEl.appendChild(clone);
    return clone;
  }

  setZoom(zoom) {
    const { width, height } = this.canvas;
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.dx = 0;
    this.dy = 0;
    this.x = width / 2.0;
    this.y = height / 2.0;
    this.update();
    process.nextTick(() => {
      this.update();
    });
  }

  getBounds() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    this.canvas.forEachObject((obj) => {
      const coords = obj.getBounds();

      coords.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
    });

    return [new Point(minX, minY), new Point(maxX, maxY)];
  }

  fitBounds() {
    this.onResize();

    const bounds = this.getBounds();

    const { width, height } = this.canvas;

    this.center.x = (bounds[0].x + bounds[1].x) / 2.0;
    this.center.y = -(bounds[0].y + bounds[1].y) / 2.0;

    const boundWidth = Math.abs(bounds[0].x - bounds[1].x);
    const boundHeight = Math.abs(bounds[0].y - bounds[1].y);
    const scaleX = width / boundWidth;
    const scaleY = height / boundHeight;
    this.zoom = Math.min(scaleX, scaleY);

    this.dx = 0;
    this.dy = 0;

    this.x = this.center.x;
    this.y = this.center.y;

    this.update();
  }

  fitFloor() {
    this.onResize();

    const bounds = [this.floorplan.width, this.floorplan.height];

    const { width, height } = this.canvas;

    this.center.x = (bounds[0].x + bounds[1].x) / 2.0;
    this.center.y = (bounds[0].y + bounds[1].y) / 2.0;

    const boundWidth = Math.abs(bounds[0].x - bounds[1].x);
    const boundHeight = Math.abs(bounds[0].y - bounds[1].y);
    const scaleX = width / boundWidth;
    const scaleY = height / boundHeight;
    this.zoom = Math.min(scaleX, scaleY);

    this.dx = 0;
    this.dy = 0;

    this.x = width / 2.0;
    this.y = height / 2.0;


    this.update();
  }

  reset() {
    const { width, height } = this.canvas;
    this.zoom = this._options.zoom || 1;
    this.center = new Point(this._options.center);
    this.originX = -this.canvas.width / 2 + this._options.center.x;
    this.originY = -this.canvas.height / 2 + this._options.center.y;
    this.canvas.absolutePan({
      x: this.originX,
      y: this.originY
    });

    this.dx = 0;
    this.dy = 0;
    this.x = width / 2.0;
    this.y = height / 2.0;
    this.update();
    process.nextTick(() => {
      this.update();
    });
  }

  onResize(width, height) {
    width = width || this.container.clientWidth;
    height = height || this.container.clientHeight;

    this.canvas.setWidth(width);
    this.canvas.setHeight(height);

    this.originX = -this.canvas.width / 2 + this._options.center.x + this.center.x;
    this.originY = -this.canvas.height / 2 + this._options.center.y - this.center.y;

    // this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.dx = 0;
    this.dy = 0;
    this.x = width / 2.0;
    this.y = height / 2.0;

    this.canvas.absolutePan({
      x: this.originX,
      y: this.originY
    });

    this.grid.setSize(width, height);

    this.update();
  }

  update() {
    const canvas = this.canvas;

    this.grid.update2({
      x: this.center.x,
      y: this.center.y,
      zoom: this.zoom
    });

    this.emit('update', this);
    this.grid.render();

    if (this.isGrabMode()) {
      canvas.relativePan(new Point(this.dx, this.dy));
      this.emit('panning');
    }

    canvas.zoomToPoint(new Point(this.x, this.y), this.zoom);

    const objects = canvas.getObjects();
    for (let i = 0; i < objects.length; i += 1) {
      const object = objects[i];
      if (object.keepOnZoom) {
        object._set('scaleX', 1 / this.zoom);
        object._set('scaleY', 1 / this.zoom);
        this.emit(`${object.class}scaling`, object);
      }
    }
  }

  panzoom(e) {
    // enable interactions
    const { width, height } = this.canvas;
    // shift start
    const zoom = clamp(-e.dz, -height * 0.75, height * 0.75) / height;

    const prevZoom = 1 / this.zoom;
    let curZoom = prevZoom * (1 - zoom);
    curZoom = clamp(curZoom, this.minZoom, this.maxZoom);

    let { x, y } = this.center;

    // pan
    const oX = 0.5;
    const oY = 0.5;
    if (this.isGrabMode()) {
      x -= prevZoom * e.dx;
      y += prevZoom * e.dy;
    }

    if (this.zoomEnabled) {
      const tx = e.x / width - oX;
      x -= width * (curZoom - prevZoom) * tx;
      const ty = oY - e.y / height;
      y -= height * (curZoom - prevZoom) * ty;
    }
    this.center.setX(x);
    this.center.setY(y);
    this.zoom = 1 / curZoom;
    this.dx = e.dx;
    this.dy = e.dy;
    this.x = e.x0;
    this.y = e.y0;
    this.update();
  }

  registerListeners() {
    const vm = this;

    this.canvas.on('object:scaling', e => {
      if (e.target.class) {
        vm.emit(`${e.target.class}:scaling`, e.target.parent);
        return;
      }
      const group = e.target;
      if (!group.getObjects) return;

      const objects = group.getObjects();
      group.removeWithUpdate();
      for (let i = 0; i < objects.length; i += 1) {
        const object = objects[i];
        object.fire('moving');
        vm.emit(`${object.class}:moving`, object.parent);
      }
      vm.update();
      vm.canvas.renderAll();
    });

    this.canvas.on('object:scaling', e => {
      if (e.target.class) {
        vm.emit(`${e.target.class}:scaling`, e.target.parent);
        return;
      }
      const group = e.target;
      if (!group.getObjects) return;

      const objects = group.getObjects();
      group.removeWithUpdate();
      for (let i = 0; i < objects.length; i += 1) {
        const object = objects[i];
        object.fire('moving');
        vm.emit(`${object.class}:moving`, object.parent);
      }
      vm.update();
      vm.canvas.renderAll();
    });

    this.canvas.on('object:rotating', e => {
      if (e.target.class) {
        vm.emit(`${e.target.class}:rotating`, e.target.parent);
        return;
      }
      const group = e.target;
      if (!group.getObjects) return;
      const objects = group.getObjects();
      for (let i = 0; i < objects.length; i += 1) {
        const object = objects[i];
        if (object.class) {
          object._set('angle', -group.angle);
          object.fire('moving');
          vm.emit(`${object.class}:moving`, object.parent);
        }
      }
      this.update();
    });

    this.canvas.on('object:moving', e => {
      if (e.target.class) {
        vm.emit(`${e.target.class}:moving`, e.target.parent);
        return;
      }
      const group = e.target;
      if (!group.getObjects) return;
      const objects = group.getObjects();
      for (let i = 0; i < objects.length; i += 1) {
        const object = objects[i];
        if (object.class) {
          object.fire('moving');
          vm.emit(`${object.class}:moving`, object.parent);
        }
      }
      this.update();
    });

    this.canvas.on('object:moved', e => {
      if (e.target.class) {
        vm.emit(`${e.target.class}dragend`, e);
      }
      this.update();
    });

    this.canvas.on('selection:cleared', e => {
      const objects = e.deselected;
      for (let i = 0; i < objects.length; i += 1) {
        const object = objects[i];
        if (object.class) {
          object._set('angle', 0);
          object._set('scaleX', 1 / vm.zoom);
          object._set('scaleY', 1 / vm.zoom);
          object.fire('moving');
        }
      }
    });

    this.canvas.on('mouse:down', e => {
      vm.dragObject = e.target;
    });

    this.canvas.on('mouse:move', e => {
      if (vm.dragObject && vm.dragObject.clickable) {
        if (vm.dragObject === e.target) {
          vm.dragObject.dragging = true;
        } else {
          vm.dragObject.dragging = false;
        }
      }
    });

    this.canvas.on('mouse:up', e => {
      if (vm.dragObject && vm.dragObject.clickable) {
        if (vm.dragObject !== e.target) return;
        if (!vm.dragObject.dragging && !vm.modeToggleByKey) {
          console.log('click');
          vm.emit(`${vm.dragObject.class}:click`, vm.dragObject.parent);
        }
        vm.dragObject.dragging = false;
      }
      vm.dragObject = null;
    });

    window.addEventListener('resize', () => {
      vm.fitBounds();
    });

    document.addEventListener('keyup', () => {
      if (this.modeToggleByKey && this.isGrabMode()) {
        this.setModeAsSelect();
        this.modeToggleByKey = false;
      }
    });

    document.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey) {
        if (this.isSelectMode()) {
          this.setModeAsGrab();
        }
        this.modeToggleByKey = true;
      }
    });
  }

  unregisterListeners() {
    this.canvas.off('object:moving');
    this.canvas.off('object:moved');
  }
}

export const map = (container, options) => new Map(container, options);