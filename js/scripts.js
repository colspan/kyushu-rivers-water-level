
var domains_river = {}

function init(){
    var range_river_circle = 40;
    var siteinfos = {};
    var scales_river = [];
    var c_scales_river = [];
    var positions = [];

    var projection;

    var geodata_topo;
    var river_log;

    var svg = d3.select("#drawarea_map").attr("width", "100%").attr("height", 660);
    var svg_path = d3.select("#drawarea_path")
    .attr("width", "100%")
    .attr("preserveAspectRatio", "xMinYMax meet")
    .attr("viewBox", "0 0 800 50");
    var text_date;

    /* 値変換 */
    function row(d){
        Object.keys(d).forEach(function(k){
            if(k=="datetime") d[k] = new Date(d[k]);
            else d[k] = +d[k];
        });
        return d;
    }
    function get_row(data,target_index){
        var target_row = [];
        Object.keys(data[target_index]).forEach(function(k){
            if(k!="datetime") target_row.push(data[target_index][k]);
        });
        return target_row;
    }
    function get_datetime(data,target_index){
        return data[target_index]["datetime"];
    }


    // データ読み込み
    var p_data_map = new Promise(function(resolve, reject){
        d3.json("./data/44_oita_topo.json",function(error, data){
            if(error){
                reject(error);
                return;
            }
            geodata_topo = data;
            resolve(data);
        });
    });
    var p_data_siteinfo = new Promise(function(resolve, reject){
        d3.csv("./data/siteinfo.csv")
          .get(function(error, data){
            if(error){
                reject(error);
                return;
            }
            data.forEach(function(d){siteinfos[d.site_id]=d})
            resolve(siteinfos);
          })
          .row(function(d){
            function parseLonLat(x){
                var reg = new RegExp("[度分秒]");
                var row = x.split(reg);
                return +row[0] + (+row[1])/60 + (+row[2])/60/60;
            }
            Object.keys(d).forEach(function(k){
                if(k=="coordinate") {
                    var lon, lat;
                    var row = d[k].split(" ");
                    lat = parseLonLat(row[1]);
                    lon = parseLonLat(row[3]);
                    d[k] = [lon,lat];
                }
            });
            return d;
        });
    });
    var p_data_river_log = new Promise(function(resolve, reject){
        d3.csv("./data/water_level_log.csv").row(row).get(function(error, data){
            if(error){
                reject(error);
                return;
            }
            river_log = data;
            resolve(data);
        });
    });

    // 処理開始
    Promise.all([p_data_map, p_data_siteinfo, p_data_river_log]).then(ready);

    function ready(data){

        river_log.forEach(function(d){
            Object.keys(d).forEach(function(k){
                if(k==="datetime") return;
                if(!domains_river[k]){
                    domains_river[k] = [999999999, -999999999];
                }
                domains_river[k][0] = Math.min(d[k]*0.9, domains_river[k][0]);
                domains_river[k][1] = Math.max(d[k]*1.1, domains_river[k][1]);
            })
        })
        Object.keys(domains_river).forEach(function(k){
            positions.push( siteinfos[k].coordinate );
        });

        // 値域定義
        Object.keys(domains_river).forEach(function(k){
            scales_river.push( d3.scaleLinear()
            .domain(domains_river[k])
            .range([0, range_river_circle]));

            c_scales_river.push( d3.scaleLinear()
            .domain(domains_river[k])
            .range(["blue","red"]));
        });

        console.log(geodata_topo);
        // 地図描画
        var kyushu_geo = topojson.merge(geodata_topo, geodata_topo.objects["44_oita"].geometries.filter(function(d){return true}));

        var oita_geo = topojson.merge(geodata_topo, geodata_topo.objects["44_oita"].geometries.filter(function(d){return d.properties.N03_001 == "大分県"}));

        projection = d3.geoMercator()
		.scale(25000)
		.translate([600,300])
		.center(d3.geoCentroid(kyushu_geo));

        var path = d3.geoPath().projection(projection);
        svg.append("path")
            .datum(kyushu_geo)
            .attr("d",path)
            .attr("fill","#ddddcc");

        var path = d3.geoPath().projection(projection);
        svg.append("path")
            .datum(oita_geo)
            .attr("d",path)
            .attr("fill","#ffccbb");

        text_date = svg.append("text").attr("x",50).attr("y",600).text("").attr("font-size","56");


        var target_index = 0;
        var target_row = get_row(river_log,target_index);
        var target_interval;
        var update_index = function(){
            target_index += 1;
            if(target_index>river_log.length-1) target_index = 0;
            d3.select("#index-selector").property("value", target_index);
            update_river(get_row(river_log,target_index),get_datetime(river_log,target_index));
        }
        d3.select("#index-selector").attr("max", river_log.length-1);
        d3.select("#index-selector").on("input", function(){
            clearInterval(target_interval);
            update_river(get_row(river_log,this.value),get_datetime(river_log,this.value));
        });
        d3.select("#index-selector").on("change", function(){
            target_index = +this.value;
            target_interval = setInterval(update_index, 200);
        });
        target_interval = setInterval(update_index, 200);

    }
    // 共通処理
    var timeFormat = d3.timeFormat("%Y/%m/%d %H:%M");
    function update_river(target_row,target_datetime){
        var alert_counter = 0;
        var circles = svg.selectAll("circle")
        .data(target_row);
        circles.enter()
        .append("circle");
        circles.exit().remove();
        circles.attr("cx", function(d,i){
            var x = projection(positions[i])[0];
            return x;
        }).attr("cy", function(d,i){
            var y = projection(positions[i])[1];
            return y;
        })
        .attr("r", function(d,i) {
            var v = scales_river[i](d);
            if(v<0) v = 1;
            if(v>range_river_circle*0.8) alert_counter++; // 水位が大きくなったら警告フラグ発動
            return v;
        })
        .attr("fill", function(d,i){
            return c_scales_river[i](d);
        });

        text_date.text(timeFormat(target_datetime));
        text_date.style("fill", alert_counter > 2 ? "red" : "black");
    }

}

init();

