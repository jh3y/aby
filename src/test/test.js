'use strict';
const expect   = require('chai').expect,
  sinon        = require('sinon'),
  fs           = require('fs'),
  winston      = require('winston'),
  BoltInstance = require('../lib/core/instance'),
  BoltTask     = require('../lib/core/task');

const PROPS = {
  NAME: 'bolt',
  CONFIG: '.boltrc',
  DIR: 'bolt.tasks'
};

const genTaskFile = (name, opts) => {
  const requirePath = `${process.cwd()}/${PROPS.DIR}/${name}`;
  if (require.cache[requirePath]) delete require.cache[requirePath];
  const funcMatch = /"(function)? *[ a-z ]*\({1}[ a-z, ]*\){1} *(=>)? *.*}"{1}/gmi;
  if (opts.func) opts.func = opts.func.toString().replace(new RegExp('\\n', 'g'), '');
  let content = `module.exports = ${JSON.stringify(opts)}`;
  const matches = content.match(funcMatch);
  if (matches && matches.length)
    for (const match of matches) {
      content = content.replace(match, match.substring(1, match.length - 1));
    }
  fs.writeFileSync(`${PROPS.DIR}/${name}`, content);
};


const cleanUp = function () {
  try {
    fs.accessSync(PROPS.CONFIG, fs.F_OK);
    fs.unlinkSync(PROPS.CONFIG);
    fs.accessSync(PROPS.DIR, fs.F_OK);
    const files = fs.readdirSync(PROPS.DIR);
    if (files.length !== 0)
      for (const file of files) fs.unlinkSync(`${PROPS.DIR}/${file}`);
    fs.rmdirSync(PROPS.DIR);
  } catch (err) {
    return;
  }
};

describe(PROPS.NAME, function() {
  describe('instance', function() {
    describe('setup', function () {
      afterEach(cleanUp);
      it('throws error when missing setup files', function() {
        const MISSING_MSG = `Missing ${PROPS.NAME} files...`;
        expect(() => new BoltInstance()).to.throw(Error, MISSING_MSG);
        fs.writeFileSync(PROPS.CONFIG, '{}');
        expect(() => new BoltInstance()).to.throw(Error, MISSING_MSG);
        fs.mkdirSync(PROPS.DIR);
        expect(() => new BoltInstance()).to.throw(Error);
      });
    });

    describe('registry', function() {
      beforeEach(function() {
        fs.writeFileSync(PROPS.CONFIG, '{}');
        fs.mkdirSync(PROPS.DIR);
      });
      afterEach(cleanUp);

      it('empty tasks throw error', () => {
        const ERR_MSG = 'Task missing properties...';
        genTaskFile('task.js', {});
        expect(() => new BoltInstance()).to.throw(Error, ERR_MSG);
      });
      it('throws error where task missing props', () => {
        const ERR_MSG = 'Task missing properties...';
        const opts = {
          name: 'A',
          doc : 'A failing task'
        };
        genTaskFile('task.js', opts);
        expect(() => new BoltInstance()).to.throw(Error, ERR_MSG);
      });
      it('registers tasks', () => {
        const opts = {
          name: 'A',
          doc : 'A generic task',
          func: function(){}
        };
        genTaskFile('task.js', opts);
        const instance = new BoltInstance();
        expect(instance.tasks.A).to.not.be.undefined;
      });
      it('registers multiple tasks', () => {
        const optsA = {
          name: 'A',
          doc : 'A generic task',
          func: () => {}
        };
        const optsB = {
          name: 'B',
          doc : 'A generic task',
          func: () => {}
        };
        genTaskFile('A.js', optsA);
        genTaskFile('B.js', optsB);
        let myInstance = new BoltInstance();
        expect(Object.keys(myInstance.tasks).length).to.equals(2);
      });
      it('does not allow duplicates', () => {
        const ERR_MSG = 'Task A already defined...';
        const optsA = {
          name: 'A',
          doc : 'A generic task',
          func: () => {}
        };
        const optsB = {
          name: 'A',
          doc : 'A generic task',
          func: () => {}
        };
        genTaskFile('A.js', optsA);
        genTaskFile('B.js', optsB);
        expect(() => new BoltInstance()).to.throw(Error, ERR_MSG);
      })
    });
    describe('running', () => {
      beforeEach(() => {
        fs.writeFileSync(PROPS.CONFIG, '{}');
        fs.mkdirSync(PROPS.DIR);
      });
      afterEach(cleanUp);
      it('runs task', (done) => {
        const opts = {
          name: 'A',
          doc : 'A dummy task',
          func: (instance) => {
            instance.__parent.env++;
            instance.resolve();
          }
        };
        genTaskFile('task.js', opts);
        const newInstance = new BoltInstance(0);
        winston.info = sinon.stub();
        winston.profile = sinon.stub();
        newInstance.runTask('A').then(() => {
          expect(newInstance.env).to.equals(1);
          done();
        });
      });
      it('runs two tasks', (done) => {
        const opts = {
          name: 'A',
          doc : 'A dummy task',
          func: (instance) => {
            instance.__parent.env++;
            instance.resolve();
          }
        };
        genTaskFile('A.js', opts);
        opts.name = 'B';
        opts.pre  = 'A';
        genTaskFile('B.js', opts);
        const newInstance = new BoltInstance(0);
        newInstance.runTask('B').then(() => {
          expect(newInstance.env).to.equals(2);
          done();
        });
      });
      it('runs tasks in correct order', (done) => {
        const opts = {
          name: 'A',
          doc : 'A dummy task',
          func: (instance) => {
            instance.__parent.env = 'A';
            instance.resolve();
          }
        };
        genTaskFile('A.js', opts);
        opts.name = 'C';
        opts.func = (instance) => {
          instance.__parent.env += 'C';
          instance.resolve();
        };
        genTaskFile('C.js', opts);
        opts.name = 'B';
        opts.pre  = 'A';
        opts.post = 'C';
        opts.func = (instance) => {
          instance.__parent.env += 'B';
          instance.resolve();
        }
        genTaskFile('B.js', opts);
        const myInstance = new BoltInstance();
        myInstance.runTask('B').then(() => {
          expect(myInstance.env).to.equal('ABC');
          done();
        })
      });
    });
  });
});

/**
  * TODO
  * INSTANCE TESTING
  TICK * 1. Generating new BoltInstance throws error when no .boltrc or bolt.tasks or
  TICK * no tasks in bolt.tasks folder
  TICK * 2. Correctly registers tasks, NO duplicates, throw error.
  * 3. Correctly generates task pool(concurrent and sequential tasks)
  TICK not sure it's feasible * 4. Potentially test the info function to check output
  TICK * 5. Task gen should fail where a task has no name, func, or description
  * 6. pre/post hook is covered by getPool testing
  * 7. But can we test if I run 'B', 'A' and 'C' are also run(and in order???)
  * 8. Testing of the actual "run" task will be tricky
  * TASK Testing
  * 1. Test that a task is correctly generated with the correct content?
  * 2. Task run function, check that BoltInstance has the correct properties
  * 3. Constructor fails if certain properties don't exist.
  TICK * 4. Check that run actually is invoked by BoltInstance?
*/
