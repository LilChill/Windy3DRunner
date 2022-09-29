import * as THREE from 'three';
import { IFCLoader } from "./three.js-r139/examples/jsm/loaders/IFCLoader.js";

import { OrbitControls } from "../three.js-r139/examples/jsm/controls/OrbitControls.js";
let camera=null;
let renderer=null;
let scene = null;

$(function(){
    var params;
    $.ajax({
        type: "get",
        url: "data/data3D.json",
        dataType: "json",
        async:false,
        success: function (response) {
            params = {
                canvasWidth:window.innerWidth,
                canvasHeight:window.innerHeight,
                speedRate:0.10,
                speed:0.115,
                particlesNumber:1000,
                displayLayers:1,
                maxAge:120,
                color: new THREE.Vector3(
                Math.random() * 0.6 + 0.4,//Math.random() * 0.6 + 0.4
                0.4 + 0.2,
                0.4 + 0.2),
                pointSize:10.0,
                lengthRate: 0.12
            };
            windy = new ThreeJs(response,params);
        },
        error: function (errorMsg) {
            console.log("请求数据失败!");
        }
    });

    var canrefresh = -1,canrefresh2 = -1;//拖动粒子个数和存活时间滑块时，不能随时刷新，需要隔一段时间刷新，避免卡顿
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_count',
            min:100,
            max:10000,
            value:params.particlesNumber,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    clearTimeout(canrefresh);
                    windy.particlesNumber = value;
                    canrefresh = setTimeout(function(){
                        windy.redraw();
                    },500);
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_layers',
            min:-1,
            max:20,
            value:params.displayLayers,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    clearTimeout(canrefresh);
                    windy.displayLayers = value;
                    canrefresh = setTimeout(function(){
                        windy.redraw();
                    },500);
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_length',
            min:1.0,
            max:100.0,
            value:params.lengthRate*100,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    windy.pointSize = value/100;
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_linewidth',
            min:1.0,
            max:20.0,
            value:params.pointSize,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    windy.pointSize = value;
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_speed',
            min:1,
            max:1000,
            value:params.speed,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    windy.speed = value/1000;
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_age',
            min:10,
            max:500,
            value:params.maxAge,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    clearTimeout(canrefresh2);
                    windy.maxAge = value;
                    canrefresh2 = setTimeout(function(){
                        windy.redraw();
                    },500);
                }
            }
        });
    });
    // 颜色选择插件初始化
    $('.windycanvas_picker').each(function(inx,dom){
        $(dom).ColorPicker({
            color: $(dom).val(),
            pickerDom:$(dom),
            pickerDomInx:0,
            onShow: function (colpkr) {
                $(colpkr).fadeIn(300);
                return false;
            },
            onHide: function (colpkr) {
                $(colpkr).fadeOut(300);
                return false;
            },
            //onchange方法改过，pickerdom,inx是新增的属性
            //pickerdom：当前点击节点，inx就是pickerDomInx属性，跟for循环中i相同，用来更新颜色之后同步修改颜色数组
            onChange: function (hsb, hex, rgb,pickerdom,inx) {
                var colorvl = '#' + hex;
                $(pickerdom).val(colorvl);
                $(pickerdom).next().css({ "background-color":  colorvl});
                if(windy){
                    windy.color = colorvl;
                }
            }
        });
    });
})


class ThreeJs{
    constructor(json,params) {
        this.light=null;
        this.cube=null;
        this.canvasContext=null;
        this.canvasWidth = params.canvasWidth||window.innerWidth;//画板宽度
        this.canvasHeight = params.canvasHeight||window.innerHeight;//画板高度
        this.displayLayers= params.displayLayers||-1;   //展示层数，-1默认为总层数
        this.particlesNumber = params.particlesNumber ||3000;  //生成的粒子个数
        this.speedRate = params.speedRate ||0.10;
        this.speed = params.speed||0.105;
        this.maxAge=params.maxAge||120;
        this.color=params.color ;
        this.pointSize = params.pointSize||10.0;
        this.lengthRate=params.lengthRate||0.08;
        this.initOpacity=1; //粒子初始透明度
        this.windData = json;
        this.windField=null;
        this.particles=[];
        this.curves=[];
        this.animateFrame=null;
        this.frameTime = 10;//每秒刷新次数，因为requestAnimationFrame固定每秒60次的渲染，所以如果不想这么快，就把该数值调小一些
        this.pointInterval=0.015;
        this.uniforms = {
            u_time: {value: 0.0},
            // speed:{value:this.speed},
            // size:{value:this.pointSize},
            // startTime:{value:0.0},
            // maxAge:{value:this.maxAge},
            // color:{value:this.color}
        };

        this.matSetting = {
            color:this.color,
            size: this.pointSize,
            max_age:this.maxAge,
            points_number: 4000,
            speed :  this.speed,
            length_rate : this.lengthRate

        };
        this._init();
    }
    _init(){

        this.windField=this.createField();
        // 创建风场粒子
        for (var i = 0; i < this.particlesNumber; i++) {
            this.particles.push(this.randomParticle(new CanvasParticle()));
        }

        // let curves= this.initCircleCurveGroup();
        // console.log(curves)
        //group=new THREE.Group();
        this._initScene();
        this._initLight();
        this._initCamera();
        //Setup IFC Loader
        this.draw();
        var ifcLoader = new IFCLoader();
        ifcLoader.ifcManager.setWasmPath("../three.js-r139/examples/jsm/loaders/ifc/");
        ifcLoader.load(
            "../three.js-r139/examples/models/ifc/rac_advanced_sample_project.ifc",
            function (model) {
                model.translateX(-50);
                model.translateZ(19);
                model.mesh.renderOrder=2;
                scene.add(model.mesh);
            }
        );
        // this._initObject();
        var axisHelper = new THREE.AxesHelper(2500);
        scene.add(axisHelper);



        this._initRenderer();
        // console.log(renderer)


    }
    _initRenderer(){
        renderer=new THREE.WebGLRenderer({  antialias: true } );//,logarithmicDepthBuffer: true

        renderer.setSize(this.canvasWidth, this.canvasHeight);//设置渲染区域尺寸

        // renderer.domElement.id = 'renderer_' + name;
        // renderer.setClearColor(0x000000, 1); //设置背景颜色
        document.body.appendChild(renderer.domElement);
        var that=this;
        const loopTime = 10 * 1000; // loopTime: 循环一圈的时间
        this.canvasContext=renderer.getContext();
        function render (){
            // console.log(camera.position)
            renderer.render(scene,camera);//执行渲染操作

            that.animateFrame=requestAnimationFrame(render);

            that.uniforms.u_time.value+=0.01;

        }

        render();
        var controls = new OrbitControls(camera,renderer.domElement);//创建控件对象

    }
    _initScene(){
        scene= new THREE.Scene()
        scene.background = new THREE.Color( 0x8cc7de );
    }
    _initLight() {
        const directionalLight1 = new THREE.DirectionalLight( 0xffeeff, 0.8 );
        directionalLight1.position.set( 1, 1, 1 );
        scene.add( directionalLight1 );

        const directionalLight2 = new THREE.DirectionalLight( 0xffffff, 0.8 );
        directionalLight2.position.set( - 1, 0.5, - 1 );
        scene.add( directionalLight2 );

        const ambientLight = new THREE.AmbientLight( 0xffffee, 0.25 );
        scene.add( ambientLight );
    }
    _initCamera() {
        camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 1000 );
        camera.position.z = 70;
        camera.position.y = 25;
        camera.position.x = 90;
    }
    //根据现有参数重新生成风场
    redraw(){
        window.cancelAnimationFrame(this.animateFrame);
        this.particles = [];
        this.curves=[];
        // renderer.properties.remove(material);
        this._init();
    }
    _parseWindJson() {
        var header = null,
            component=[];
        this.windData.forEach(function (record) {
            header=record.header;
            var data = record['data'];
            var speed=[],
                angel=[];
            for(var i=0;i<data.length;i++){
                var temp=data[i].split("/");
                speed.push(parseFloat(temp[0]));
                angel.push(parseFloat(temp[1]));
            }
            component.push({
                height: record.header.height,
                speed:speed,
                angel:angel
            });
        });
        // console.log(component)
        return {
            header: header,
            component:component
        };
    }
    createField(){
        var data=this._parseWindJson();
        return new GridSpace(data);
    }

    //随机数生成器（小数）
    fRandomByfloat(under, over){
        let res=under+Math.random()*(over-under)
        if(res<0) console.log(res)
        return res;
    }
    fRandomByInteger(under,over){
        return Math.floor(Math.random() * (over - under)) + under;
    }
    //根据当前风场网格行列数随机生成粒子
    randomParticle (particle) {
        var safe = 30,x, y,z;

        do {
            x = this.fRandomByfloat(0,this.windField.cols - 2);
            y = this.fRandomByfloat(0,this.windField.rows - 2);
            z = this.fRandomByInteger(0,this.displayLayers>0?Math.min(this.displayLayers-1,this.windField.layers - 1):this.windField.layers - 1);
        } while ((this.windField.getIn(x, y, z) <= 0||this.windField.isInBound(x,y,z)) && safe++ < 30);
        // console.log(this.uniforms.u_time.value,particle.isCreated)
        var field = this.windField;
        var uvw = field.getIn(x, y, z);
        var nextX = x +  this.speedRate * uvw[0]*Math.cos(uvw[1]);
        var nextY = y +  this.speedRate * uvw[0]*Math.sin(uvw[1]);
        var nextZ = z;
        // var nextZ = z +  this.speedRate * uvw[2];
        particle.curvesPoints=[];
        particle.x = x;
        particle.y = y;
        particle.z = z;
        particle.tx = nextX;
        particle.ty = nextY;
        particle.tz=nextZ;
        particle.opacity=this.initOpacity;
        particle.speed = uvw;
        particle.age = this.fRandomByInteger(2,this.maxAge);//每一次生成都不一样
        this.initCircleCurveGroup(particle)
        // if(particle.isCreated===false){
        //     this.initCircleCurveGroup(particle)
        //     particle.isCreated=true;
        //
        // }
        // else this.updateCircleCurveGroup(particle)
        return particle;
    }
    //根据粒子当前所处的位置(棋盘网格位置)，得到canvas画板中的位置，以便画图
    _map(x,y,z) {
        var field = this.windField,
            fieldWidth = field.cols,
            fieldHeight = field.rows,
            fieldLayers = field.layers,
            newArr = [0,0,0];

        newArr[0] = ((x/fieldWidth)*this.canvasWidth-(this.canvasWidth/2))/8;
        newArr[2] = ((y/fieldHeight)*this.canvasHeight-(this.canvasHeight/2))/8;
        newArr[1] = (z/fieldLayers)*100;

        return newArr;
    }

    /**
     *初始化线条路径
     *
     *
     */
    initCircleCurveGroup(particle) {
        let self=this;
        var x = particle.x,
            y = particle.y,
            z = particle.z,
            tx =particle.tx,
            ty = particle.ty,
            tz = particle.tz,
            uvw = null;
        var time = particle.age;
        while(self.windField.isInBound(x, y, z)&&time>0){
            uvw = self.windField.getIn(x, y, z);
            var newPos = self._map(x,y,z);
            particle.curvesPoints.push(new THREE.Vector3(newPos[0],newPos[1],newPos[2]));
            time--;
            x=tx;
            y=ty;
            //z=tz;
            tx = tx + self.speedRate * uvw[0] * Math.cos(uvw[1]);
            ty = ty + self.speedRate * uvw[0] * Math.sin(uvw[1]);
        }
        var curve = new THREE.CatmullRomCurve3(particle.curvesPoints,false);
        curve.userData = this.uniforms.u_time.value;
        if (curve.points.length<=1){
            curve.points=[];
        }

        self.curves.push(curve)
        particle.curveIndex = this.curves.length-1;




    }
    /**
     * 更新线条路径
     */
    updateCircleCurveGroup(particle){
        let self=this;
        var x = particle.x,
            y = particle.y,
            z = particle.z,
            tx =particle.tx,
            ty = particle.ty,
            tz = particle.tz,
            uvw = null;
        var time = particle.age;
        while(self.windField.isInBound(x,y,z)&&time>0){
            uvw = self.windField.getIn(x, y, z);
            var newPos = self._map(x,y,z);
            particle.curvesPoints.push(new THREE.Vector3(newPos[0],newPos[1],newPos[2]));
            time--;
            x=tx;
            y=ty;
            //z=tz;
            tx = tx + self.speedRate * uvw[0] * Math.cos(uvw[1]);
            ty = ty + self.speedRate * uvw[0] * Math.sin(uvw[1]);
        }
        var curve = this.curves[particle.curveIndex];
        // console.log(curve)
        curve.points=particle.curvesPoints;
        curve.userData = this.uniforms.u_time.value;
        //console.log(curve)
        // console.log(curve.userData)
        if (curve.points.length<=1){
            curve.points=[];
        }
        self.curves[particle.curveIndex]=curve;
    }
    /**
     * 初始化材质
     * */
    initLineMaterial(setting,pNumber,startTime) {
        // let number = setting ? Number(setting.number) || 1.0 : 1.0;
        let speed =setting ? Number(setting.speed) || 1.0 : 1.0;//this.uniforms.speed;//
        let length = Number(setting.length_rate*pNumber) ;
        let points_number = pNumber ;
        let size = setting ? Number(setting.size) || 2.0 : 2.0;//this.uniforms.size;//
        let start_time = startTime;//this.uniforms.startTime;//
        let max_age = setting?Number(setting.max_age) ||120 :120;//this.uniforms.maxAge;//
        let color =  setting ? setting.color:new THREE.Vector3(
            0.4 + 0.2,//Math.random() * 0.6 + 0.4
            0.4 + 0.2,
            0.4 + 0.2
        );
            // this.uniforms.color;


        //console.log(start_time)
        let singleUniforms = {
            u_time:  this.uniforms.u_time,
            start_time: { type: "f", value: start_time },
            length : { type: "f", value: length },
            max_age: { type: "f", value: max_age },
            points_number: { type: "f", value: points_number },
            speed: { type: "f", value: speed },
            uSize: { type: "f", value: size },
            color: { type: "v3", value: color},
        };

        return new THREE.ShaderMaterial({
            uniforms: singleUniforms,
            vertexShader: document.getElementById("vertexShader").textContent,
            fragmentShader: document.getElementById("fragmentShader").textContent,
            transparent: true,
            depthWrite: false
        });
    }
    draw(){
        let self=this;
        let i=1;
        for(let curve of this.curves) {
            // console.log(curve.points.length)
            var interval = (curve.points.length- 1)/this.pointInterval ;
            var points = curve.getPoints(interval);
            var geometry = new THREE.BufferGeometry().setFromPoints(points);
            let length = points.length;
            var pNumber = length;
            //console.log(pNumber,length)
            var indexes = new Float32Array(length);
            for (let i = 0; i < points.length; i += 1) {
                indexes[i] = i;
            }
            geometry.setAttribute("aIndex", new THREE.BufferAttribute(indexes, 1));
            geometry.verticesNeedUpdate = true;
            //curve.userData = self.uniforms.u_time;
            let lineMaterial = self.initLineMaterial(self.matSetting,pNumber,curve.userData);

            let obj = new THREE.Points(geometry,lineMaterial);
            obj.renderOrder=1;
            scene.add(obj);
            curve.sceneIndex = obj.id;
        }


        // console.log(scene.children)

    }

}

class GridSpace{
    constructor(obj) {
        this.west = null;
        this.east = null;
        this.south = null;
        this.north = null;
        this.up=null;
        this.down=null;

        this.rows = null;
        this.cols = null;
        this.layers=null;
        this.dx = null;
        this.dy = null;
        this.dz=null;

        this.grid = null;
        this._init(obj);
    }
    _init(obj){
        var header=obj.header,
            component=obj['component'];
        this.west = header['la1'];
        this.east = header['la2'];
        this.south = header['lb1'];
        this.north = header['lb2'];
        this.up=header['lc2'];
        this.down=header['lc1'];

        this.rows = header['ny'];
        this.cols = header['nx'];
        this.layers=header['nz'];
        this.dx = header['dx'];
        this.dy = header['dy'];
        this.dz = header['dz'];

        this.grid=[];

        var n=0,
            layers = null,rows=null,
            i,j,k;
        for(k=0;k<this.layers;k++){
            layers=[];
            for(j=0;j<this.rows;j++){
                rows=[];
                for(i=0;i<this.cols;i++){
                    var uvw= [component[k].speed[j*this.cols+i],component[k].angel[j*this.cols+i]];
                    rows.push(uvw);
                }
                layers.push(rows);
            }
            this.grid.push(layers);

        }
        // console.log(this.grid);
    }
    _calcUVW(u,v,w){
        var val=Math.sqrt(u * u + v * v);
        return [u, v,w, Math.sqrt(val * val + w * w)];
    }
    //双线性插值计算给定节点的速度
    _bilinearInterpolation (tx, ty, g00, g10, g01, g11) {
        var rx = (1 - tx);
        var ry = (1 - ty);
        var a = rx * ry, b = tx * ry, c = rx * ty, d = tx * ty;
        var speed = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        var angel = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [speed,angel];
    }
    //三线性插值计算给定节点的速度
    _trilinearInterpolation(tx, ty, tz, g000,g100,g010,g110,g001,g101,g011,g111) {
        var rx = (1 - tx);  //x1-x
        var ry = (1 - ty);  //y1-y
        var rz=  1 - tz;    //z1-z
        var speed,angel,v,w;
        var a=rx*ry*rz, b=rz*ry*tx,c=rz*ty*rx,d=rz*ty*tx,
            e=tz*ry*rx,f=tz*ry*tx,g=tz*ty*rx,h=tz*ty*tx;
        speed=a*g000[0]+b*g100[0]+c*g010[0]+d*g110[0]+e*g001[0]+f*g101[0]+g*g011[0]+h*g111[0];
        angel= a*g000[1]+b*g100[1]+c*g010[1]+d*g110[1]+e*g001[1]+f*g101[1]+g*g011[1]+h*g111[1];
        return [speed,angel];
    }
    getIn(x, y, z) {
        var x0 = Math.floor(x),//向下取整
            y0 = Math.floor(y),
            // z0=Math.floor(z),
            x1, y1,z1;
        if (x0 === x && y0 === y) {  //x0 === x && y0 === y&&z0===z
            return this.grid[z][y][x];
        }

        x1 = x0 + 1;
        y1 = y0 + 1;
        // z1 = z0 + 1;
        var g00 = this.getIn(x0, y0,z),
            g10 = this.getIn(x1, y0,z),
            g01 = this.getIn(x0, y1,z),
            g11 = this.getIn(x1, y1,z);
        return this._bilinearInterpolation(x - x0, y - y0, g00, g10, g01, g11);
    }
    isInBound(x, y,z) { //坐标是否在棋盘内部
        return (x >= 0 && x < this.cols-2) && (y >= 0 && y < this.rows-2) && (z >= 0 && z < this.layers-1);
    }
}

/****
 *粒子对象
 ****/
class CanvasParticle{
    constructor() {
        this.x = null;//粒子初始x位置(相对于棋盘网格，比如x方向有360个格，x取值就是0-360，这个是初始化时随机生成的)
        this.y = null;//粒子初始y位置(同上)
        this.z = null;//粒子初始z位置(同上)
        this.tx = null;//粒子下一步将要移动的x位置，这个需要计算得来
        this.ty = null;//粒子下一步将要移动的y位置，这个需要计算得来
        this.tz = null;//粒子下一步将要移动的z位置，这个需要计算得来
        this.age = null;//粒子生命周期计时器，每次-1
        this.opacity=null;
        this.speed = null;//粒子移动速度，可以根据速度渲染不同颜色
        this.curvesPoints=[];//粒子轨迹上的点集合
        this.curveIndex=null;  //粒子轨迹在curveGroup里面的索引
        // this.isCreated=false;
    }
}
// export {ThreeJs}
