/*
 * SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import SendIcon from "@mui/icons-material/Send";
import CancelIcon from "@mui/icons-material/Cancel";
import DownloadIcon from "@mui/icons-material/Download";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimesCircle } from '@fortawesome/free-solid-svg-icons';

import ChatMessage from "./ChatMessage";
import Mark from "../Mark";
import { config } from "../../config/config";
import { useRenderImage } from "../../context/RenderImageContext";
import { showCartNotification } from "../../utils";

/**
 * Main chatbox component for the shopping assistant
 */

interface ChatboxProps {
  /**
   * A question to send as soon as the intro has played. The landing page's
   * ask bar hands its text over this way (`/assistant?q=`), so the visitor
   * lands on an answer in progress rather than an empty panel.
   */
  initialQuery?: string;
}

const Chatbox: React.FC<ChatboxProps> = ({ initialQuery }) => {
  const { setNewRenderImage } = useRenderImage();
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [hasBeenOpened, setHasBeenOpened] = useState<boolean>(false);
  const [newMessage, setNewMessage] = useState<string>("");
  // The on-screen toggle was removed to give the conversation more room;
  // guardrails stay on via the config default and are still sent to the server.
  const isGuardrailsOn = config.features.guardrails.defaultState;
  const [image, setImage] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [lastAssistantIndex, setLastAssistantIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shownCartOperations = useRef<Set<string>>(new Set());

  // Utility functions
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const getOrCreateUserId = () => {
    const storedId = sessionStorage.getItem('shopping_user_id');
    if (storedId) return parseInt(storedId, 10);
    
    const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    sessionStorage.setItem('shopping_user_id', String(newId));
    return newId;
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(new Error("Failed to read the file."));
      reader.readAsDataURL(file);
    });
  };

  const base64ToBlob = (base64: string): Blob => {
    const base64WithoutPrefix = base64.split(',')[1];
    const binaryString = atob(base64WithoutPrefix);
    const byteArray = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    
    return new Blob([byteArray], { type: "image/png" });
  };

  // Event handlers
  const handleNewMessageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(event.target.value);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validate file
    const maxSizeMB = config.features.imageUpload.maxSize;
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    if (!config.features.imageUpload.allowedTypes.includes(file.type)) {
              toast.error('Please select a valid image file (JPEG or PNG only)');
      return;
    }

    try {
      const base64Image = await convertToBase64(file);
      setImage(base64Image);
      
      const decodedImage = base64ToBlob(base64Image);
      const imageUrl = window.URL.createObjectURL(decodedImage);
      setPreviewImage(imageUrl);
      
      e.target.value = "";
    } catch (error) {
      toast.error('Failed to upload image');
    }
  };

  const clearImage = () => {
    setPreviewImage("");
    setImage("");
  };

  const addMessage = (role: string, content: any, productName: string = "") => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages, { role, content, productName }];
      messageRefs.current = newMessages.map((_, i) => 
        messageRefs.current[i] || React.createRef<HTMLDivElement>()
      );
      
      if (role === "assistant" && (lastAssistantIndex === null || lastAssistantIndex < prevMessages.length)) {
        setLastAssistantIndex(prevMessages.length);
      }
      
      return newMessages;
    });
  };

  const updateLastMessage = (newContent: any, role?: string, appendContent?: boolean) => {
    setMessages((prevMessages) => {
      if (prevMessages.length === 0) return prevMessages;

      const updatedMessages = [...prevMessages];
      const lastMessageIndex = updatedMessages.length - 1;
      
      if (role) {
        updatedMessages[lastMessageIndex].role = role;
      }
      
      if (typeof newContent === "string") {
        updatedMessages[lastMessageIndex] = {
          ...updatedMessages[lastMessageIndex],
          content: (!appendContent) 
            ? updatedMessages[lastMessageIndex].content + newContent 
            : newContent,
        };
      } else {
        updatedMessages[lastMessageIndex] = {
          ...updatedMessages[lastMessageIndex],
          content: newContent,
        };
      }

      return updatedMessages;
    });
  };

  // `text` defaults to the input's value; the initial query passes its own.
  const handleSendMessage = async (text: string = newMessage) => {
    if (!text.trim() && !image) return;

    // Clear previous cart operation notifications for new message
    shownCartOperations.current.clear();

    const userId = getOrCreateUserId();
    setIsLoading(true);

    // Will be used to enable submit shortly after the last token
    let enableSubmitTimer: number | undefined;

    try {
      // Enable-submit helper: if no tokens arrive for a short window, consider the stream done
      const scheduleEnableSubmit = () => {
        if (enableSubmitTimer !== undefined) {
          window.clearTimeout(enableSubmitTimer);
        }
        // Short idle threshold so the button enables promptly after the last token
        enableSubmitTimer = window.setTimeout(() => {
          setIsLoading(false);
        }, 400);
      };

      // Add user message
      if (text) {
        addMessage("user", text, "");
      }
      if (image) {
        addMessage("user_image", previewImage, "");
      }

      // Add loading message
      addMessage("assistant", "loader", "");
      setNewMessage("");

      // Prepare API request
      const payload = {
        user_id: userId,
        query: text,
        guardrails: isGuardrailsOn,
        image: image || "",
        image_bool: !!image
      };
      
      // Clear image immediately after preparing payload
      setImage("");
      setPreviewImage("");

      const url = `${config.api.baseUrl}${config.api.endpoints.stream}`;

      // Send request
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullResponse = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.startsWith('data:'));

        for (const line of lines) {
          const raw = line.replace(/^data:\s*/, '');
          
          if (raw === '[DONE]') {
            // Stream closed by server; enable submit immediately
            setIsLoading(false);
            return;
          }
          
          try {
            const { type, payload } = JSON.parse(raw);
            
            if (type === 'content') {
              fullResponse += payload;
              
              // Check for cart operations and show notifications
              showCartNotification(fullResponse, shownCartOperations.current, toast);

              // Tokens are flowing; schedule enable when they stop
              scheduleEnableSubmit();
            } else if (type === 'products') {
              // Robot spec cards: name, price, seller count, platform support.
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  role: 'product_row',
                  content: payload,
                };
                return updated;
              });
            } else if (type === 'images') {
              const images = Object.entries(payload).map(([productName, productUrl]) => ({
                productUrl,
                productName
              }));

              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  role: 'image_row',
                  content: images,
                };
                return updated;
              });
            } else if (type === 'bom') {
              // BOM result from generate_bom tool — render as a parts table
              // Push as a new message AFTER the current assistant text message
              setMessages(prev => {
                const updated = [...prev];
                updated.push({
                  role: 'bom_row',
                  content: payload,
                  productName: '',
                });
                return updated;
              });
            }

            // Update assistant message
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];

              if (last?.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  content: fullResponse
                };
              } else {
                updated.push({
                  role: 'assistant',
                  content: fullResponse,
                  productName: ""
                });
                setLastAssistantIndex(updated.length - 1);
              }

              return updated;
            });
          } catch (e) {
            continue;
          }
        }
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message. Please try again.');
      
      // Remove loading message on error
      setMessages(prev => prev.filter(msg => msg.content !== 'loader'));
    } finally {
      // Clear any pending enable timer and ensure loading is false
      if (enableSubmitTimer !== undefined) window.clearTimeout(enableSubmitTimer);
      setIsLoading(false);
    }
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isLoading) {
      handleSendMessage();
    }
  };

  const handleReset = async () => {
    setMessages([]);
    setImage("");
    setPreviewImage("");
    setNewRenderImage("");
    sessionStorage.removeItem('shopping_user_id');

    // Add welcome messages
    addMessage(
      "system",
      `You are a robotics buying advisor on ${config.ui.brand}. You help people choose programmable educational and industrial robots, explain technical specifications in plain language, and compare prices across verified sellers. Use emojis but do not use too many. Structure your output using Markdown but do not use nested indentations.`,
      ""
    );
    
    await sleep(1000);
    addMessage("assistant", "", "");
    
    await sleep(1000);
    const introduction = "Hello! 👋 I'm your robot advisor. I can help you find robotics parts, explain the technical terms in plain language, and compare what each one costs across sellers.\n\nHere are some things you could ask me:\n\n• Show me motion sensors under Rs 500\n• What works with ESP32?\n• Beginner parts for a first Arduino build\n• What does I2C mean?";
    
    const words = introduction.split(" ");
    for (const word of words) {
      await sleep(40);
      updateLastMessage(word + " ");
    }
  };

  // Effects
  useEffect(() => {
    // The message list is column-reverse, so scrollTop 0 is the newest message.
    // Anchoring there keeps the end of the latest reply sitting just above the
    // input. Previously this called scrollIntoView({ block: "start" }) on the
    // last assistant message, which pinned that message's *top* to the top of
    // the list and left its bottom cut off mid-line behind the input.
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      setHasBeenOpened(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (hasBeenOpened) {
      handleReset().then(() => {
        if (initialQuery) handleSendMessage(initialQuery);
      });
    }
  }, [hasBeenOpened]);

  return (
    <div>
      <div className="chatbox">
        <div className={`chatbox__support ${isOpen ? "chatbox--active" : ""}`}>
          {/* Header */}
          <div className="chatbox__header">
            <Mark width={16} className="chatbox__mark" />
            <h4 className="chatbox__heading--header">
              {config.ui.assistantName}
            </h4>
          </div>

          {/* Messages */}
          <div className="chatbox__messages" ref={messagesContainerRef}>
            {[...messages].reverse().map((msg, index) => (
              <ChatMessage 
                key={index} 
                role={msg.role} 
                content={msg.content} 
                productName={msg.productName} 
                ref={messageRefs.current[messages.length - 1 - index]} 
              />
            ))}
          </div>

          {/* Footer */}
          <div className="chatbox__footer">
             {/* Image preview */}
             {previewImage && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={previewImage} alt="Preview" style={{ width: '50px', height: '50px' }} />
                <button
                  type="button"
                  style={{
                    display: 'inline-flex',
                    position: 'absolute',
                    right: '-5px',
                    top: '-5px',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                  onClick={clearImage}
                  aria-label="Clear image"
                >
                  <FontAwesomeIcon icon={faTimesCircle} />
                </button>
              </div>
            )}

            {/* Input field */}
            <input
              ref={inputRef}
              type="text"
              className="input_test"
              placeholder="Type something here..."
              value={newMessage}
              onChange={handleNewMessageChange}
              onKeyUp={handleKeyUp}
            />

            {/* Action buttons */}
            <div className="button-class">
              <SendIcon
                sx={{ color: isLoading ? "#c9c9c9" : "#171717", cursor: isLoading ? "not-allowed" : "pointer" }}
                onClick={isLoading ? () => {} : () => handleSendMessage()}
                fontSize="large"
              />
            </div>
            
            <div className="button-class">
              <CancelIcon
                sx={{ color: "#666666" }}
                onClick={handleReset}
                fontSize="large"
              />
            </div>
            
            <div className="button-class" style={{ transform: "rotate(180deg)" }}>
              <label htmlFor="image-upload" style={{ cursor: "pointer" }}>
                <DownloadIcon
                  sx={{ color: "#666666" }}
                  fontSize="large"
                />
              </label>
              <input
                style={{ display: "none" }}
                type="file"
                accept="image/*"
                id="image-upload"
                name="image"
                onChange={handleImageUpload}
              />
            </div>
          </div>

        </div>

        {/* Chatbox toggle button (hidden) */}
        <div className="chatbox__button" style={{ visibility: "hidden" }}>
          <button onClick={() => setIsOpen(!isOpen)}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Chat_icon.svg/44px-Chat_icon.svg.png" alt="Chat" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbox;
