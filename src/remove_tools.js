import { toolKey } from "./utils";

export function remove_hidden_tools(data, removed_tools){
  // remove from the data array the participants that the user has hidden (removed_tools)
  // create a new array where the tools that have not been hidden will be stored
  let tools_not_hidden = [];
  data.forEach(element => {
    if (!removed_tools.includes(toolKey(element.toolname))){
      tools_not_hidden.push(element);
    }
  });

  return tools_not_hidden;

};