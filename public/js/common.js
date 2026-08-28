window.G={
  font:'Raleway,Arial,sans-serif',
  button(s,x,y,w,label,fn){
    const r=s.add.rectangle(x,y,w,54,0x111111,.88).setStrokeStyle(2,0xffffff,.7).setInteractive({useHandCursor:true}).setDepth(900);
    s.add.text(x,y,label,{fontFamily:G.font,fontSize:'18px',fontStyle:'700',color:'#fff'}).setOrigin(.5).setDepth(901);
    r.on('pointerdown',fn);return r;
  },
  hud(s,name,level){

    s.add
        .rectangle(
            960,
            47,
            1920,
            94,
            0x000000,
            .92
        )
        .setDepth(880);

    s.add
        .text(
            25,
            16,
            name,
            {
                fontFamily:G.font,
                fontSize:'28px',
                fontStyle:'700',
                color:'#fff'
            }
        )
        .setDepth(881);

    G.button(
        s,
        1460,
        46,
        175,
        'RETURN TO MAP',
        async()=>{
            if(!Session.isHost){
                Net.msg('Only the host changes scenes.');
                return;
            }

            const response =
                await Net.scene('Map');

            if(!response || !response.ok){
                Net.msg(
                    response?.message ||
                    'Could not return to the map.'
                );
                return;
            }

            /*
             * Normally the server broadcast performs this.
             * This is a safe host-side fallback.
             */
            if(s.scene.isActive()){
                s.scene.start('Map');
            }
        }
    );

    G.button(
        s,
        1650,
        46,
        155,
        'RESTART',
        ()=>s.scene.restart()
    );

    if(Session.isHost){
        G.button(
            s,
            1815,
            46,
            150,
            'SKIP',
            async()=>{
                const response =
                    await Net.skip(level);

                if(!response || !response.ok){
                    Net.msg(
                        response?.message ||
                        'Could not skip the objective.'
                    );
                    return;
                }

                Net.msg('Objective skipped.');
            }
        );
    }
}
  achievement(s,t){
    s.add.text(960,155,t,{fontFamily:G.font,fontSize:'34px',fontStyle:'800',color:'#fff',backgroundColor:'rgba(0,0,0,.82)',padding:{x:24,y:13}}).setOrigin(.5).setDepth(890);
  },
  platform(s,x,y,w,h=30){const p=s.add.rectangle(x,y,w,h,0xff0000,0);s.physics.add.existing(p,true);return p},
  zone(s,x,y,w,h){const z=s.add.rectangle(x,y,w,h,0xffff00,0);s.physics.add.existing(z,true);return z},
  dust(s,x,y,c=0xb9a789){
    for(let i=0;i<9;i++){
      const d=s.add.circle(x+Phaser.Math.Between(-18,18),y,Phaser.Math.Between(2,5),c,.75).setDepth(520);
      s.tweens.add({targets:d,x:d.x+Phaser.Math.Between(-30,30),y:y-Phaser.Math.Between(16,28),scale:.3,alpha:0,duration:340,onComplete:()=>d.destroy()});
    }
  },
  hideInputs(){for(const id of ['player-name','room-code'])document.getElementById(id).style.display='none'}
};
