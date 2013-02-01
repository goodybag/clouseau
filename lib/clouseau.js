var logger = require('spruce').init();
var fs = require('fs');

var Profiler = {
    tree: {
        name: "main",
        count: 1,
        elapsed: 0,
        children: {}
    },
    scope: null,
    totals: {},
    minPercent: 0,
    enabled: false,

    getTick: function() {
        var t = process.hrtime();
        return t[0] + t[1] / 1000000000.0;
    },
    init: function(options) {
        if (this.enabled) {
            if (options) {
                if (options.minPercent >= 0 && options.minPercent < 100) {
                    this.minPercent = options.minPercent;
                }
            }

            this.scope = this.tree;

            this.assignClassNames();

            this.initialized = true;
        }
    },
    enter: function(name) {
        if (!this.initialized) {
            this.init();
        }

        var node = this.scope.children[name] ? this.scope.children[name] :
            (this.scope.children[name] = {
                name: name,
                count: 0,
                elapsed: 0,
                children: {},
                chidrenElapsed: 0,
                parent: this.scope
            });

        node.started = this.getTick();
        node.childrenElapsed = 0;
        this.scope = node;
    },
    exit: function() {
        var node = this.scope;
        var elapsed = this.getTick() - node.started;

        node.elapsed += elapsed;
        if (node.parent) {
            node.parent.childrenElapsed += elapsed;
        }
        node.count++;

        var total = this.totals[node.name] ? this.totals[node.name] :
            (this.totals[node.name] = {
                name: node.name,
                elapsed: 0,
                localElapsed: 0,
                count:0
            });
        total.elapsed += elapsed;
        total.localElapsed += (elapsed > node.childrenElapsed) ? (elapsed - node.childrenElapsed) : 0;
        total.count++;

        this.scope = node.parent;

        if (this.scope == undefined) {
            console.log(this.scope.started);
        }
    },
    getFormattedData: function() {
        var self = this;
        var data = {
            totalElapsed: 0,
            tree:{},
            totals:[]
        };

        // Calculate total elapsed
        this.tree.elapsed = 0;
        for (var i in this.tree.children) {
            this.tree.elapsed += this.tree.children[i].elapsed;
        }

        data.tree = this.getFormatNodeData(this.tree, this.tree.elapsed);
        data.totals = this.sortLocal(this.totals).map(function(total) {
            total.localPercent   = {
                ofAll    : 100 * total.localElapsed / self.tree.elapsed,
                toString : function() { return ''+this.ofAll; }
            };
            total.totalPercent   = {
                ofAll    : 100 * total.elapsed / self.tree.elapsed,
                toString : function() { return ''+this.ofAll; }
            };
            total.totalAverage   = total.elapsed / total.count;
            total.localAverage   = total.localElapsed / total.count;
            total.totalAveragef  = self.formatElapsedTime(total.totalAverage);
            total.localAveragef  = self.formatElapsedTime(total.localAverage);
            total.elapsedf       = self.formatElapsedTime(total.elapsed);
            total.localElapsedf  = self.formatElapsedTime(total.localElapsed);
            total.totalElapsed   = total.elapsed;
            total.totalElapsedf  = total.elapsedf;
            return total;
        });
        data.totalElapsed = this.tree.elapsed;

        return data;
    },
    getFormatNodeData: function(sourceNode, parentElapsed) {
        var targetNode = {
            name          : sourceNode.name,
            totalElapsed  : sourceNode.elapsed,
            totalElapsedf : this.formatElapsedTime(sourceNode.elapsed),
            totalPercent  : {
                ofParent : 100 * sourceNode.elapsed / parentElapsed,
                ofAll    : 100 * sourceNode.elapsed / this.tree.elapsed,
                toString : function() { return ''+this.ofAll; }
            },
            totalAverage  : sourceNode.elapsed / sourceNode.count,
            totalAveragef : this.formatElapsedTime(sourceNode.elapsed / sourceNode.count),
            count         : sourceNode.count
        };

        if (targetNode.totalPercent >= this.minPercent) {

            var childrenArr = this.sort(sourceNode.children);
            targetNode.localElapsed = sourceNode.elapsed - childrenArr.reduce(function(acc, node) { return acc + node.elapsed; }, 0);
            targetNode.localElapsedf = this.formatElapsedTime(targetNode.localElapsed);
            targetNode.localPercent = {
                ofParent : 100 * targetNode.localElapsed / parentElapsed,
                ofAll    : 100 * targetNode.localElapsed / this.tree.elapsed,
                toString : function() { return ''+this.ofAll; }
            };
            targetNode.localAverage = targetNode.localElapsed / sourceNode.count;
            targetNode.localAveragef = this.formatElapsedTime(targetNode.localAverage);

            targetNode.children = [];
            for (var i = 0; i < childrenArr.length; i++) {
                targetNode.children.push(this.getFormatNodeData(childrenArr[i], sourceNode.elapsed));
            }
        }

        return targetNode;
    },
    formatElapsedTime: function(t) {
        if (t < 0.000001) {
            return (t*1000000000).toFixed(2) + 'ns';
        }
        if (t < 0.001) {
            return (t*1000000).toFixed(2) + 'mcs';
        }
        if (t < 1) {
            return (t*1000).toFixed(2) + 'ms';
        }
        if (t < 60) {
            return (t).toFixed(2) + 's';
        }
        if (t < 3600) {
            return (t/60).toFixed(2) + 'min';
        }
        return (t/3600).toFixed(2) + 'hr';
    },
    sortAvg: function(o) {
        var a = [];
        for(var i in o) {
            var total = o[i];
            if (total.count) {
                a.push(total);
            }
        }
        a.sort(function(t1, t2) {
            return (t2.elapsed /t2.count - t1.elapsed /t1.count);
        });
        return a;

    },
    sort: function(o) {
        var a = [];
        for(var i in o) {
            var total = o[i];
            if (total.count) {
                a.push(total);
            }
        }
        a.sort(function(t1, t2) {
            return (t2.elapsed - t1.elapsed);
        });
        return a;

    },
    sortLocal: function(o) {
        var a = [];
        for(var i in o) {
            var total = o[i];
            if (total.count) {
                a.push(total);
            }
        }
        a.sort(function(t1, t2) {
            return (t2.localElapsed - t1.localElapsed);
        });
        return a;

    },
    assignClassNames: function() {
        var g = global;

        for(var name in g) {
            var thing = g[name];
            if ((typeof thing == "function") && thing.prototype && (thing.prototype.ClassName == "anonymous")) {
                thing.prototype.ClassName = name;
            }
        }
    }
};

var fnLocHash = {};

function __f(fn, givenName) {
    if (Profiler.enabled) {
        var key = __f.caller.toString().length + "," + fn.toString.length;
        if(!fnLocHash[key]) {
            var err = new Error('');
            var callerLine = err.stack.split("\n")[2];
            var index1 = callerLine.lastIndexOf("/");
            var index2 = callerLine.lastIndexOf(":");
            fnLocHash[key] = (__f.caller.name || "anonymous ") + callerLine.substr(index1 + 1, index2 - index1 - 1);
        }
        var name = givenName || fnLocHash[key];

        return function() {
            try {
                Profiler.enter(name);

                var ret = fn.apply(this, arguments);
            } catch(e) {
                Profiler.exit();

                throw(e);
            }

            Profiler.exit();

            return ret;
        }
    } else {
        return fn;
    }
};

module.exports = Profiler;
module.exports.__f = __f;

/*
USAGE:
var X = {

    callSomeAsync(param1, param2, __f(function() {
        // callback code
    }));


    doSomething: function(x) {
        __f(function() {
            return 5 * x;
        });

        return x * x;
    }
}
*/
