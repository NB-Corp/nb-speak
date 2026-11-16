import {
  registerSpeakToolsAndPrompt,
                                  
                           
} from './dsh-tools.js';
                                                      

                                         
                                       
                          
 

                                   
                                      
                                                    
                                            
                                          
 

export const name = 'nb-speak-agent';
export const inject = {
  tools: { required: true },
  systemPrompt: { required: true },
  nbSpeak: { required: false },
};

export function apply(ctx                  )       {
  ctx.effect(() =>
    registerSpeakToolsAndPrompt(ctx.tools, ctx.systemPrompt, {
      getSliderConfig: () => ctx.nbSpeak?.getSliderConfig() ?? { preset: 'neutral_peer' },
      getCustomSoul: () => ctx.nbSpeak?.getCustomSoul() ?? '',
    }),
  );
}
