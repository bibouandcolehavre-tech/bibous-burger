'use strict';
// Proximity estimate, never a promised exact travel time. No GPS history.
function near(order,position){
  const d=order?.deliveryDestination;
  if(order?.status!=='out_for_delivery'||order.method!=='delivery'||order.payment?.status!=='PAID'||order.reviewMode||order.amendment?.status==='pending'||order.kroklyDriver?.status!=='picked_up'||!position||!d||d.source!=='google-routes'||position.accuracy>30||position.validForMs<=0||position.ageSeconds>=15||
    ![d.latitude,d.longitude,position.latitude,position.longitude,position.accuracy,position.ageSeconds,position.validForMs].every(Number.isFinite)||position.accuracy<0||position.ageSeconds<0||Math.abs(d.latitude)>90||Math.abs(d.longitude)>180||Math.abs(position.latitude)>90||Math.abs(position.longitude)>180)return false;
  const r=x=>x*Math.PI/180,a=r(d.latitude-position.latitude),b=r(d.longitude-position.longitude),h=Math.sin(a/2)**2+Math.cos(r(d.latitude))*Math.cos(r(position.latitude))*Math.sin(b/2)**2;
  const meters=6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  return meters+position.accuracy<=150;
}
module.exports={near};
