/** Recovered game-only source from the owned Match3 v2 r2 preview. See recovery manifest. */
import match3LayoutDefaults from '../../app/hud-layout/defaultLayouts/match3.json' with {type:'json'};

function composeMatch3({
  width:width,
  height:height,
  hudLayout:hudLayout={
  },
  safe:safe=hudLayout.viewport?.safeAreaInsets||{
  }
}){
  const config={
    ...match3LayoutDefaults.base.regions.match3Composition,
    ...hudLayout.regions?.match3Composition
  };
  const inset=ue=>Math.max(0, Number(ue)||0);
  const safeInsets=Object.fromEntries(["top", "right", "bottom", "left"].map(ue=>[ue, inset(safe[ue])]));
  const landscape=width>height;
  const gutter=width>=config.largeGutterWidth?config.largeGutter:config.gutter;
  const usableWidth=Math.max(1, width-safeInsets.left-safeInsets.right-2*gutter);
  const usableHeight=Math.max(1, height-safeInsets.top-safeInsets.bottom-2*gutter);
  const left=safeInsets.left+gutter;
  const top=safeInsets.top+gutter;
  const rect=(ue, Me, E, U)=>({
    left:ue,
    top:Me,
    width:E,
    height:U
  });
  let title;
  let hud;
  let boardFrame;
  let selection;
  let tools;
  let event;
  let gap;
  let compact;
  if(landscape){
    compact=usableHeight<=config.landscapeCompactHeight;
    gap=compact?config.landscapeCompactGap:config.landscapeGap;
    const ue=Math.min(usableWidth*config.railMaxFraction, Math.max(config.railMin, Math.min(config.railMax, usableWidth*config.railFraction)));
    const Me=compact?config.railCompactGap:config.railGap;
    const E=Math.max(1, Math.min(usableHeight, usableWidth-ue-Me, config.landscapeMaxBoard));
    const U=E+Me+ue;
    const J=left+(usableWidth-U)/2;
    boardFrame=rect(J, top+(usableHeight-E)/2, E, E);
    let ie=compact?config.landscapeCompactRows.find(B=>usableHeight>=B.minHeight)?.rows:config.landscapeRows;
    ie||(gap=config.landscapeTightGap, ie=[0, Math.max(config.tightHudMin, usableHeight-config.tightRowsFixedHeight), config.tightSelection, config.tightTools, 0]);
    const ne=ie.filter(B=>B>0);
    const S=ne.reduce((B, V)=>B+V, 0)+gap*(ne.length-1);
    let C=top+Math.max(0, (usableHeight-S)/2);
    const O=B=>{
      if(!B)return null;
      const V=rect(J+E+Me, C, ue, B);
      return C+=B+gap,
      V
    };
    title=O(ie[0]);
    hud=O(ie[1]);
    selection=O(ie[2]);
    tools=O(ie[3]);
    event=O(ie[4]);
  }else{
    compact=usableWidth<=config.portraitCompactWidth||usableHeight<config.portraitCompactHeight;
    gap=compact?config.portraitCompactGap:config.portraitGap;
    const ue=compact?config.portraitCompactRows:config.portraitRows;
    const Me=ue.filter(C=>C>0);
    const E=Me.reduce((C, O)=>C+O, 0)+gap*Me.length;
    const U=Math.max(1, Math.min(usableWidth, usableHeight-E, config.portraitMaxBoard));
    const J=E+U;
    const ie=Math.min(usableWidth, Math.max(U, Math.min(usableWidth, config.minChromeWidth)));
    let ne=top+Math.max(0, (usableHeight-J)/2);
    const S=(C, O=ie)=>{
      if(!C)return null;
      const B=rect(left+(usableWidth-O)/2, ne, O, C);
      return ne+=C+gap,
      B
    };
    title=S(ue[0]);
    hud=S(ue[1]);
    boardFrame=S(U, U);
    selection=S(ue[2]);
    tools=S(ue[3]);
    event=S(ue[4]);
  }
  const frameInset=Math.min(config.frameInset, boardFrame.width/8);
  const board=rect(boardFrame.left+frameInset, boardFrame.top+frameInset, boardFrame.width-frameInset*2, boardFrame.height-frameInset*2);
  board.rows=8;
  board.cols=8;
  board.cell=board.width/8;
  board.size=board.width;
  board.frame=boardFrame;
  const toolGap=compact?config.toolCompactGap:config.toolGap;
  const toolColumns=landscape?3:5;
  const toolRows=landscape?2:1;
  const toolWidth=(tools.width-toolGap*(toolColumns-1))/toolColumns;
  const toolHeight=(tools.height-toolGap*(toolRows-1))/toolRows;
  const toolRects=Array.from({
    length:5
  }, (ue, Me)=>rect(tools.left+Me%toolColumns*(toolWidth+toolGap), tools.top+Math.floor(Me/toolColumns)*(toolHeight+toolGap), toolWidth, toolHeight));
  return{
    width:width,
    height:height,
    safe:safeInsets,
    landscape:landscape,
    compact:compact,
    gutter:gutter,
    gap:gap,
    title:title,
    hud:hud,
    frame:boardFrame,
    board:board,
    selection:selection,
    tools:tools,
    mode:event,
    buttons:toolRects,
    frameInset:frameInset
  }
}

export {composeMatch3};
