import { DirtyLevels } from "./constants";

export let activeEffect: any = undefined; // 当前正在执行的effect

function preCleanEffect(effect) {
	effect._depsLength = 0;
  effect._trackId++; // 每次执行 _trackId 都 +1
}

function postCleanEffect(effect) {
	if (effect.deps.length > effect._depsLength) {
    // 删除映射表中对应的 effect
    for (let i = effect._depsLength; i < effect.deps.length; i++) {
      cleanDepEffect(effect.deps[i], effect);
    }
    // 更新依赖列表
    effect.deps.length = effect._depsLength;
  }
}

function cleanDepEffect(dep, effect: ReactiveEffect) {
  dep.delete(effect);
  if (dep.size == 0) {
    dep.cleanup();
  }
}

export class ReactiveEffect { 
  // 用于记录当前 effect 执行了几次
  _trackId = 0;
  _depsLength = 0;
  // 通过 _running 属性防止递归调用
  _running = 0;
  // 取值时是否需要运行计算属性
  _dirtyLevel = DirtyLevels.Dirty;

  deps = [] as any[];

  // 创建的 effect 是响应式的
  public active = true;

  constructor(public fn, public scheduler) {}

  public get dirty() {
    return this._dirtyLevel === DirtyLevels.Dirty;
  }

  public set dirty(isDirty: boolean) {
    this._dirtyLevel = isDirty ? DirtyLevels.Dirty : DirtyLevels.NoDirty;
  }

  run() {
    // 每次运行后，effect 变为 NoDirty
    this._dirtyLevel = DirtyLevels.NoDirty;

    if(!this.active) {
      return this.fn();
    }

    let lastEffect = activeEffect; // 用于构建当前激活的effect
    try {
      activeEffect = this;
      
      // effect 重新执行前，需要将上次的依赖清空
      preCleanEffect(this);

      this._running++;
      return this.fn(); // 依赖收集
    }
    finally {
      this._running--;
      postCleanEffect(this);
      activeEffect = lastEffect;
    }
  }
  stop() {
    if(this.active) {
      this.active = false;
      preCleanEffect(this);
      postCleanEffect(this);
    }
  }
}

export function effect(fn, options?) {
  // 创建一个响应式 effect，数据变化后可以重新执行
	const _effect = new ReactiveEffect(fn, () => {
    // scheduler
		_effect.run();
	});
	_effect.run();

  // 用用户传递的覆盖内置的
	if (options) {
		Object.assign(_effect, options);
	}

	const runner: any = _effect.run.bind(_effect);
  // 可以在 run 方法上获取到 effect 的引用
	runner.effect = _effect;
	return runner;
}

export function trackEffect(effect, dep) {
  if (dep.get(effect) !== effect._trackId) {
    dep.set(effect, effect._trackId);
    let oldDep = effect.deps[effect._depsLength];

    // 没有存过
    if (oldDep !== dep) {
      // 删掉旧的
      if (oldDep) {
        cleanDepEffect(oldDep, effect);
      }
      // 存入新的
      effect.deps[effect._depsLength++] = dep;
    } else {
      effect._depsLength++;
    }
  }
}

export function triggerEffects(dep) {
  for (const effect of dep.keys()) {
    // 当前这个值是不脏的，但是触发更新后需要将值变为脏值
    if (effect._dirtyLevel < DirtyLevels.Dirty) {
      effect._dirtyLevel = DirtyLevels.Dirty;
    }
    if (!effect._running) {
      // 防止递归调用，正在执行的 effect 不再执行 run
      if (effect.scheduler) {
        effect.scheduler();
      }
    }
  }
}